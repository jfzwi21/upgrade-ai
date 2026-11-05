package com.anythingllm.updater

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.net.URL
import java.util.Locale
import java.util.concurrent.TimeUnit

class InAppUpdaterModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(10, TimeUnit.MINUTES)
        .build()

    override fun getName() = "InAppUpdaterModule"

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    @ReactMethod
    fun checkForUpdate(promise: Promise) {
        scope.launch {
            try {
                val release = withContext(Dispatchers.IO) { fetchLatestRelease() }
                val result = Arguments.createMap()
                val currentVersion = currentVersionName()
                if (release == null) {
                    result.putString("status", "no_release")
                    result.putString("currentVersion", currentVersion)
                    promise.resolve(result)
                    return@launch
                }

                result.putString("version", release.tag)
                result.putString("releaseUrl", release.htmlUrl)
                result.putString("currentVersion", currentVersion)
                if (release.apkUrl == null) {
                    result.putString("status", "no_apk")
                } else if (isNewerVersion(release.tag, currentVersion)) {
                    result.putString("status", "available")
                    result.putString("assetName", release.apkName)
                } else {
                    result.putString("status", "up_to_date")
                }
                promise.resolve(result)
            } catch (error: Exception) {
                promise.reject("UPDATE_CHECK_FAILED", error.message, error)
            }
        }
    }

    @ReactMethod
    fun downloadAndInstall(promise: Promise) {
        scope.launch {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    !reactApplicationContext.packageManager.canRequestPackageInstalls()
                ) {
                    val settingsIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${reactApplicationContext.packageName}")
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactApplicationContext.startActivity(settingsIntent)
                    promise.resolve(Arguments.createMap().apply {
                        putString("status", "permission_required")
                    })
                    return@launch
                }

                val release = withContext(Dispatchers.IO) { fetchLatestRelease() }
                    ?: throw IOException("No GitHub release has been published yet")
                val apkUrl = release.apkUrl ?: throw IOException("The latest release does not contain an APK")
                val apkFile = withContext(Dispatchers.IO) { downloadApk(apkUrl, release.apkSha256) }
                validateDownloadedApk(apkFile)
                openPackageInstaller(apkFile)
                promise.resolve(Arguments.createMap().apply {
                    putString("status", "installer_opened")
                    putString("version", release.tag)
                })
            } catch (error: Exception) {
                promise.reject("UPDATE_INSTALL_FAILED", error.message, error)
            }
        }
    }

    private fun fetchLatestRelease(): ReleaseInfo? {
        val request = Request.Builder()
            .url(LATEST_RELEASE_URL)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "Upgrade-AI-Android-Updater")
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (response.code == 404) return null
            if (!response.isSuccessful) {
                throw IOException("GitHub returned HTTP ${response.code}")
            }
            val json = JSONObject(response.body?.string() ?: throw IOException("GitHub returned an empty response"))
            val tag = json.optString("tag_name").takeIf { it.isNotBlank() }
                ?: throw IOException("The latest GitHub release has no version tag")
            val assets = json.optJSONArray("assets")
            val apkCandidates = mutableListOf<Triple<String, String, String?>>()
            if (assets != null) {
                for (index in 0 until assets.length()) {
                    val asset = assets.optJSONObject(index) ?: continue
                    val name = asset.optString("name")
                    val url = asset.optString("browser_download_url")
                    if (!name.endsWith(".apk", ignoreCase = true) || url.isBlank()) continue
                    if (INCOMPATIBLE_APK_ARCH_PATTERN.containsMatchIn(name)) continue
                    val digest = asset.optString("digest")
                        .takeIf { it.startsWith("sha256:", ignoreCase = true) }
                        ?.substringAfter(':')
                        ?.takeIf { SHA256_PATTERN.matches(it) }
                    apkCandidates.add(Triple(name, url, digest))
                }
            }
            val selectedApk = apkCandidates.firstOrNull { ARM64_APK_PATTERN.containsMatchIn(it.first) }
                ?: apkCandidates.firstOrNull()
            return ReleaseInfo(
                tag,
                json.optString("html_url"),
                selectedApk?.first,
                selectedApk?.second,
                selectedApk?.third
            )
        }
    }

    private fun downloadApk(assetUrl: String, expectedSha256: String?): File {
        val parsedUrl = URL(assetUrl)
        if (parsedUrl.protocol != "https" || parsedUrl.host.lowercase(Locale.ROOT) != "github.com") {
            throw IOException("The APK link is not a GitHub HTTPS download")
        }

        val updatesDirectory = File(reactApplicationContext.cacheDir, "updates")
        if (!updatesDirectory.exists() && !updatesDirectory.mkdirs()) {
            throw IOException("Could not create the updater cache directory")
        }
        val partialFile = File(updatesDirectory, "latest.apk.part")
        val apkFile = File(updatesDirectory, "latest.apk")
        partialFile.delete()

        val request = Request.Builder()
            .url(assetUrl)
            .header("Accept", "application/octet-stream")
            .header("User-Agent", "Upgrade-AI-Android-Updater")
            .build()

        val digest = MessageDigest.getInstance("SHA-256")
        try {
            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("APK download failed with HTTP ${response.code}")
                val finalUrl = response.request.url
                if (finalUrl.scheme != "https" || finalUrl.host !in ALLOWED_DOWNLOAD_HOSTS) {
                    throw IOException("The APK download redirected to an untrusted host")
                }
                val body = response.body ?: throw IOException("The APK download was empty")
                val totalBytes = body.contentLength()
                var downloaded = 0L
                body.byteStream().use { input ->
                    partialFile.outputStream().buffered().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE * 4)
                        var lastReportedProgress = -1
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            digest.update(buffer, 0, count)
                            downloaded += count
                            val progress = if (totalBytes > 0) ((downloaded * 100) / totalBytes).toInt() else 0
                            if (progress != lastReportedProgress) {
                                emitProgress(downloaded, totalBytes, progress)
                                lastReportedProgress = progress
                            }
                        }
                        output.flush()
                    }
                }
                if (totalBytes > 0 && downloaded != totalBytes) {
                    throw IOException("The APK download ended before all bytes were received")
                }
                val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
                if (expectedSha256 != null && !actualSha256.equals(expectedSha256, ignoreCase = true)) {
                    throw IOException("The APK SHA-256 digest does not match the release metadata")
                }
            }
        } catch (error: Exception) {
            partialFile.delete()
            throw error
        }

        if (!partialFile.exists() || partialFile.length() == 0L) {
            partialFile.delete()
            throw IOException("The downloaded APK is empty")
        }
        if (apkFile.exists() && !apkFile.delete()) {
            partialFile.delete()
            throw IOException("Could not replace the cached APK")
        }
        if (!partialFile.renameTo(apkFile)) {
            partialFile.delete()
            throw IOException("Could not finalize the downloaded APK")
        }
        emitProgress(apkFile.length(), apkFile.length(), 100)
        return apkFile
    }

    private fun validateDownloadedApk(apkFile: File) {
        val packageManager = reactApplicationContext.packageManager
        val archiveInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getPackageArchiveInfo(
                apkFile.absolutePath,
                android.content.pm.PackageManager.PackageInfoFlags.of(0L)
            )
        } else {
            @Suppress("DEPRECATION")
            packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
        } ?: throw IOException("The downloaded file is not a valid Android APK")

        if (archiveInfo.packageName != reactApplicationContext.packageName) {
            throw IOException("The downloaded APK belongs to a different application")
        }
        val apkVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            archiveInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            archiveInfo.versionCode.toLong()
        }
        if (apkVersionCode <= currentVersionCode()) {
            throw IOException("The APK is not newer than the installed version")
        }
    }

    private fun emitProgress(downloadedBytes: Long, totalBytes: Long, progress: Int) {
        val params = Arguments.createMap().apply {
            putDouble("downloadedBytes", downloadedBytes.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putInt("progress", progress)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(PROGRESS_EVENT, params)
    }

    private fun openPackageInstaller(apkFile: File) {
        val uri = FileProvider.getUriForFile(
            reactApplicationContext,
            "${reactApplicationContext.packageName}.fileprovider",
            apkFile
        )
        val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, APK_MIME_TYPE)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(installIntent)
    }

    private fun installedPackageInfo(): android.content.pm.PackageInfo? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.packageManager.getPackageInfo(
                reactApplicationContext.packageName,
                android.content.pm.PackageManager.PackageInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0)
        }
    } catch (_: Exception) {
        null
    }

    private fun currentVersionName(): String = installedPackageInfo()?.versionName ?: "0.0.0"

    private fun currentVersionCode(): Long {
        val packageInfo = installedPackageInfo() ?: return 0L
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
        }
    }

    private fun isNewerVersion(releaseTag: String, installedVersion: String): Boolean {
        val release = VERSION_PATTERN.matchEntire(releaseTag.removePrefix("v").removePrefix("V"))
        val installed = VERSION_PATTERN.matchEntire(installedVersion.removePrefix("v").removePrefix("V"))
        if (release == null || installed == null) {
            return !releaseTag.equals(installedVersion, ignoreCase = true)
        }

        for (index in 1..3) {
            val remotePart = release.groupValues[index].toLongOrNull() ?: 0L
            val currentPart = installed.groupValues[index].toLongOrNull() ?: 0L
            if (remotePart != currentPart) return remotePart > currentPart
        }

        val remotePrerelease = release.groupValues[4]
        val installedPrerelease = installed.groupValues[4]
        return remotePrerelease.isNotEmpty() &&
            (installedPrerelease.isEmpty() || remotePrerelease != installedPrerelease)
    }

    private data class ReleaseInfo(
        val tag: String,
        val htmlUrl: String,
        val apkName: String?,
        val apkUrl: String?,
        val apkSha256: String?
    )

    private companion object {
        const val LATEST_RELEASE_URL = "https://api.github.com/repos/jfzwi21/upgrade-ai/releases/latest"
        const val PROGRESS_EVENT = "InAppUpdateProgress"
        const val APK_MIME_TYPE = "application/vnd.android.package-archive"
        val VERSION_PATTERN = Regex("^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$")
        val SHA256_PATTERN = Regex("^[0-9a-fA-F]{64}$")
        val ARM64_APK_PATTERN = Regex("(?:arm64|universal)", RegexOption.IGNORE_CASE)
        val INCOMPATIBLE_APK_ARCH_PATTERN = Regex("(?:x86|i[3-6]86|armeabi-v7a|armv7)", RegexOption.IGNORE_CASE)
        val ALLOWED_DOWNLOAD_HOSTS = setOf("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
    }
}
