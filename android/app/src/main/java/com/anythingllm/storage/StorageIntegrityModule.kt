package com.anythingllm.storage

import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDatabaseCorruptException
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors

class StorageIntegrityModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "StorageIntegrity"
        private const val DATABASE_FILE_NAME = "anythingllm.db"
    }

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "StorageIntegrityModule"

    @ReactMethod
    fun checkAndOptimize(promise: Promise) {
        executor.execute {
            val databaseFile = File(reactApplicationContext.applicationInfo.dataDir, DATABASE_FILE_NAME)
            if (!databaseFile.exists()) {
                promise.resolve(report("not_present", emptyList(), "not_run", "Database file does not exist yet."))
                return@execute
            }

            var database: SQLiteDatabase? = null
            try {
                database = openDatabase(databaseFile)
                val before = runIntegrityCheck(database)
                if (!isHealthy(before)) {
                    Log.e(TAG, "integrity_check found ${before.size} issue(s); preserving the original database")
                    promise.resolve(
                        report(
                            "corrupt",
                            before,
                            "not_run",
                            "Integrity check did not return 'ok'; no database mutation was attempted."
                        )
                    )
                    return@execute
                }

                database.close()
                database = null

                try {
                    // Called before the React app imports/opens WatermelonDB. If another process owns
                    // the SQLite lock, VACUUM fails safely and the already-verified database is kept.
                    database = openDatabase(databaseFile)
                    database.execSQL("VACUUM")
                    database.close()
                    database = null

                    database = openDatabase(databaseFile)
                    val after = runIntegrityCheck(database)
                    if (!isHealthy(after)) {
                        promise.resolve(
                            report(
                                "corrupt",
                                after,
                                "performed",
                                "Post-VACUUM integrity check failed; the database file was not deleted or replaced."
                            )
                        )
                        return@execute
                    }
                    promise.resolve(report("healthy", after, "performed", "Integrity check passed before and after VACUUM."))
                } catch (maintenanceError: Exception) {
                    Log.w(TAG, "VACUUM could not run; preserving the database", maintenanceError)
                    promise.resolve(
                        report(
                            "healthy",
                            before,
                            "failed",
                            "Integrity check passed; VACUUM was skipped or failed and the database was preserved: ${maintenanceError.message ?: "unknown SQLite error"}"
                        )
                    )
                }
            } catch (error: Exception) {
                val corrupt = error is SQLiteDatabaseCorruptException ||
                    error.message?.contains("malformed", ignoreCase = true) == true ||
                    error.message?.contains("corrupt", ignoreCase = true) == true
                Log.e(TAG, "SQLite integrity check failed", error)
                promise.resolve(
                    report(
                        if (corrupt) "corrupt" else "error",
                        emptyList(),
                        "not_run",
                        "${error.javaClass.simpleName}: ${error.message ?: "SQLite check failed"}. The original database was not deleted."
                    )
                )
            } finally {
                try {
                    database?.close()
                } catch (closeError: Exception) {
                    Log.w(TAG, "Unable to close integrity-check connection", closeError)
                }
            }
        }
    }

    private fun openDatabase(file: File): SQLiteDatabase =
        SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)

    private fun runIntegrityCheck(database: SQLiteDatabase): List<String> {
        val results = mutableListOf<String>()
        database.rawQuery("PRAGMA integrity_check", null).use { cursor ->
            val resultColumn = cursor.getColumnIndex("integrity_check")
            while (cursor.moveToNext()) {
                results.add(if (resultColumn >= 0) cursor.getString(resultColumn) else cursor.getString(0))
            }
        }
        return results
    }

    private fun isHealthy(results: List<String>): Boolean =
        results.size == 1 && results[0].equals("ok", ignoreCase = true)

    private fun report(
        status: String,
        integrityResults: List<String>,
        vacuumStatus: String,
        detail: String
    ): WritableMap {
        val values: WritableArray = Arguments.createArray()
        integrityResults.forEach(values::pushString)
        return Arguments.createMap().apply {
            putString("status", status)
            putArray("integrityCheck", values)
            putString("vacuum", vacuumStatus)
            putString("detail", detail)
        }
    }
}
