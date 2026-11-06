import DeviceInfo from "react-native-device-info";
import { useEffect, useState } from "react";
import { Linking, Platform, Text, TouchableOpacity, View } from "react-native";
import { WarningCircle } from "phosphor-react-native";
import semver from "semver";
import AwaitableAlert from "@/components/AwaitableAlert";
import { PATHS } from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function ApkVersion() {
    const { t } = useTranslation();
    const deviceVersion = DeviceInfo.getVersion();
    const [isOnLatestVersion, setIsOnLatestVersion] = useState<boolean>(true);
    const [remoteVersion, setRemoteVersion] = useState<string>(deviceVersion);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        let active = true;
        const fetchRemoteVersion = async () => {
            try {
                const response = await fetch(PATHS.latest_release_api, {
                    method: 'GET',
                    headers: { Accept: 'application/vnd.github+json' },
                });
                if (!response.ok) throw new Error('Failed to fetch the latest GitHub release');
                const release = await response.json();
                if (typeof release?.tag_name !== 'string') throw new Error('Latest GitHub release has no tag');
                const latestVersion = sanitizeVersion(release.tag_name);
                if (!semver.valid(latestVersion)) throw new Error('Invalid remote version');
                if (!active) return;
                if (semver.lt(deviceVersion, latestVersion)) {
                    setIsOnLatestVersion(false);
                    setRemoteVersion(latestVersion);
                } else {
                    setIsOnLatestVersion(true);
                    setRemoteVersion(deviceVersion);
                }
            } catch (error) {
                if (active) console.error('fetchRemoteVersion:', error);
            }
        };
        void fetchRemoteVersion();
        return () => {
            active = false;
        };
    }, [deviceVersion]);

    return (
        <View className="flex flex-row items-end justify-between">
            <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">
                {t('settings.version.about')}
            </Text>
            {isOnLatestVersion ? (
                <Text style={{ color: '#888' }} className="text-sm">
                    v{deviceVersion}
                </Text>
            ) : (
                <TouchableOpacity
                    className="flex flex-row items-center gap-1" onPress={async () => {
                        await AwaitableAlert(
                            t('settings.version.update_available_title'),
                            t('settings.version.update_available_message', { version: remoteVersion }),
                            { text: t('settings.updater.download_install'), onPress: () => { Linking.openURL(PATHS.latest_release_page) } },
                            { text: t('common.cancel'), onPress: () => { }, style: 'cancel' },
                        )
                    }}>
                    <WarningCircle size={14} color="#ffba00" weight="bold" />
                    <Text style={{ color: '#ffba00' }} className="text-sm">
                        v{deviceVersion}
                    </Text>
                </TouchableOpacity>
            )}
        </View >
    );
}

function sanitizeVersion(version: string) {
    try {
        return semver.coerce(version)?.toString() ?? "0.0.0";
    } catch (e) {
        return "0.0.0";
    }
}
