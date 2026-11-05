import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast } from '@/utils/Notification';

const F_DROID_URL = 'https://f-droid.org/packages/com.termux/';
const GITHUB_URL = 'https://github.com/termux/termux-app/releases';
const ALLOW_EXTERNAL_APPS_COMMAND = 'mkdir -p ~/.termux && echo "allow-external-apps = true" >> ~/.termux/termux.properties && termux-reload-settings';

interface TermuxGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function TermuxGuideModal({ visible, onClose }: TermuxGuideModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const copy = (value: string) => {
    Clipboard.setString(value);
    showToast(t('settings.special_tools.termux_guide_copied'));
  };

  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn('[TermuxGuide] Could not open official download link', error);
      showToast(t('settings.special_tools.termux_guide_link_failed'));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('settings.special_tools.termux_guide_title')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('settings.special_tools.termux_guide_close')} onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <Text style={styles.intro}>{t('settings.special_tools.termux_guide_intro')}</Text>

            <GuideStep number="1" title={t('settings.special_tools.termux_guide_install_title')}>
              <Text style={styles.body}>{t('settings.special_tools.termux_guide_install_description')}</Text>
              <View style={styles.linkRow}>
                <LinkButton label={t('settings.special_tools.termux_guide_fdroid')} onPress={() => openLink(F_DROID_URL)} />
                <LinkButton label={t('settings.special_tools.termux_guide_github')} onPress={() => openLink(GITHUB_URL)} />
              </View>
              <Text style={styles.warning}>{t('settings.special_tools.termux_guide_store_warning')}</Text>
            </GuideStep>

            <GuideStep number="2" title={t('settings.special_tools.termux_guide_prepare_title')}>
              <Text style={styles.body}>{t('settings.special_tools.termux_guide_prepare_description')}</Text>
              <CodeExample
                code={ALLOW_EXTERNAL_APPS_COMMAND}
                copyLabel={t('settings.special_tools.termux_guide_copy')}
                onCopy={copy}
              />
            </GuideStep>

            <GuideStep number="3" title={t('settings.special_tools.termux_guide_permission_title')}>
              <Text style={styles.body}>{t('settings.special_tools.termux_guide_permission_description')}</Text>
            </GuideStep>

            <GuideStep number="4" title={t('settings.special_tools.termux_guide_examples_title')}>
              <Text style={styles.body}>{t('settings.special_tools.termux_guide_examples_description')}</Text>
              <CodeExample title={t('settings.special_tools.termux_guide_ping_title')} code="ping -c 3 google.com" copyLabel={t('settings.special_tools.termux_guide_copy')} onCopy={copy} />
              <CodeExample title={t('settings.special_tools.termux_guide_ls_title')} code="ls -la" copyLabel={t('settings.special_tools.termux_guide_copy')} onCopy={copy} />
              <CodeExample title={t('settings.special_tools.termux_guide_python_title')} code="python script.py" copyLabel={t('settings.special_tools.termux_guide_copy')} onCopy={copy} />
            </GuideStep>

            <Text style={styles.securityNote}>{t('settings.special_tools.termux_guide_security_note')}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function GuideStep({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeading}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function CodeExample({ title, code, copyLabel, onCopy }: { title?: string; code: string; copyLabel: string; onCopy: (value: string) => void }) {
  return (
    <View style={styles.codeExample}>
      {title ? <Text style={styles.codeTitle}>{title}</Text> : null}
      <View style={styles.codeRow}>
        <Text selectable style={styles.code}>{code}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${copyLabel}: ${title ?? code}`} onPress={() => onCopy(code)} style={styles.copyButton}>
          <Text style={styles.copyText}>{copyLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="link" onPress={onPress} style={styles.linkButton}>
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    width: '100%',
    maxHeight: '94%',
    borderRadius: 20,
    paddingHorizontal: 18,
    backgroundColor: '#111215',
    borderWidth: 1,
    borderColor: '#303136',
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#25262A',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 31,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 18,
    gap: 18,
  },
  intro: {
    color: '#C5C5C8',
    fontSize: 14,
    lineHeight: 21,
  },
  step: {
    gap: 10,
  },
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepNumber: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#C91F32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stepTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: '#C5C5C8',
    fontSize: 13,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#25262A',
    borderWidth: 1,
    borderColor: '#42434A',
  },
  linkText: {
    color: '#FF909A',
    fontSize: 13,
    fontWeight: '600',
  },
  warning: {
    color: '#FFD2A1',
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    borderRadius: 10,
    backgroundColor: '#302315',
  },
  codeExample: {
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#1C1D21',
    borderWidth: 1,
    borderColor: '#33343A',
  },
  codeTitle: {
    color: '#A9A9AF',
    fontSize: 12,
    fontWeight: '600',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  code: {
    flex: 1,
    flexShrink: 1,
    color: '#E7E7EB',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 17,
  },
  copyButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#33343A',
  },
  copyText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  securityNote: {
    color: '#9F9FA0',
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    borderRadius: 10,
    backgroundColor: '#1B1B1E',
  },
});
