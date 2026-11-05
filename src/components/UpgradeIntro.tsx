import * as React from 'react';
import {
  Animated,
  I18nManager,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

type UpgradeIntroProps = {
  onContinue: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function UpgradeIntro({ onContinue }: UpgradeIntroProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.toLowerCase().startsWith('ar') || I18nManager.isRTL;
  const { width, height } = useWindowDimensions();
  const layoutWidth = width > 0 ? width : 360;
  const layoutHeight = height > 0 ? height : 760;
  const tiltX = React.useRef(new Animated.Value(0)).current;
  const tiltY = React.useRef(new Animated.Value(0)).current;
  const glow = React.useRef(new Animated.Value(0)).current;
  const entrance = React.useRef(new Animated.Value(0)).current;
  const exiting = React.useRef(false);
  const continueCalled = React.useRef(false);
  const exitTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imageFailed, setImageFailed] = React.useState(false);
  const cardSize = Math.max(1, Math.min(layoutWidth - 56, 340, Math.max(180, layoutHeight - 390)));

  React.useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1700, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      if (exitTimeout.current) clearTimeout(exitTimeout.current);
    };
  }, [entrance, glow]);

  const tilt = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_, gesture) => {
          tiltX.setValue(clamp(gesture.dx / (layoutWidth * 0.38), -1, 1));
          tiltY.setValue(clamp(gesture.dy / 230, -1, 1));
        },
        onPanResponderRelease: () => {
          Animated.parallel([
            Animated.spring(tiltX, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
            Animated.spring(tiltY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(tiltX, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
            Animated.spring(tiltY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 8 }),
          ]).start();
        },
      }),
    [tiltX, tiltY, layoutWidth],
  );

  const completeExit = React.useCallback(() => {
    if (continueCalled.current) return;
    continueCalled.current = true;
    if (exitTimeout.current) clearTimeout(exitTimeout.current);
    onContinue();
  }, [onContinue]);

  const leaveIntro = React.useCallback(() => {
    if (exiting.current) return;
    exiting.current = true;
    // Never trap the user behind the intro if the native animation is interrupted or unavailable.
    exitTimeout.current = setTimeout(completeExit, 500);
    try {
      Animated.timing(entrance, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start(completeExit);
    } catch (error) {
      console.warn('[UpgradeIntro] Exit animation failed; continuing without animation', error);
      completeExit();
    }
  }, [completeExit, entrance]);

  const rotateX = tiltY.interpolate({ inputRange: [-1, 1], outputRange: ['10deg', '-10deg'] });
  const rotateY = tiltX.interpolate({ inputRange: [-1, 1], outputRange: ['-13deg', '13deg'] });
  const cardTranslateX = tiltX.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.58] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const entranceTranslate = entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const introTitle = isArabic ? 'ذكاءك، على طريقتك.' : 'Your AI. Reimagined.';
  const introCopy = isArabic
    ? 'اكتشف النماذج، شغّلها محلياً، واحتفظ ببياناتك تحت سيطرتك.'
    : 'Explore models, run them locally, and keep your data in your hands.';
  const startLabel = isArabic ? 'ابدأ الآن' : 'Enter Upgrade AI';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.topGlow} />
        <View pointerEvents="none" style={styles.bottomGlow} />
        <Animated.View
          style={[
            styles.content,
            {
              opacity: entrance,
              transform: [{ translateY: entranceTranslate }],
            },
          ]}>
          <View style={styles.eyebrowRow}>
            <View style={styles.liveDot} />
            <Text style={[styles.eyebrow, isArabic && styles.arabicText]}>
              {isArabic ? 'ذكاء محلي. آفاق أوسع.' : 'LOCAL INTELLIGENCE. UNLIMITED POTENTIAL.'}
            </Text>
          </View>

          <View style={[styles.artworkStage, { width: cardSize, height: cardSize + 22 }]}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.orbit,
                {
                  width: cardSize + 24,
                  height: cardSize + 24,
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }, { rotate: '-12deg' }],
                },
              ]}
            />
            <View pointerEvents="none" style={styles.orbitInner} />
            <Animated.View
              {...tilt.panHandlers}
              accessibilityLabel={isArabic ? 'حرّك الشعار لاستكشاف تأثير العمق' : 'Drag the logo to explore the depth effect'}
              style={[
                styles.logoCard,
                {
                  width: cardSize,
                  height: cardSize,
                  transform: [
                    { perspective: 900 },
                    { rotateX },
                    { rotateY },
                    { translateX: cardTranslateX },
                  ],
                },
              ]}>
              {imageFailed ? (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoFallbackText}>U</Text>
                </View>
              ) : (
                <Image
                  source={require('../../images/upgrade-ai-app-icon.png')}
                  resizeMode="contain"
                  style={styles.logoImage}
                  accessible={false}
                  onError={() => setImageFailed(true)}
                />
              )}
            </Animated.View>
            <View pointerEvents="none" style={styles.depthLabel}>
              <Text style={styles.depthLabelText}>3D / TOUCH</Text>
            </View>
          </View>

          <Text style={[styles.title, isArabic && styles.arabicText]}>{introTitle}</Text>
          <Text style={[styles.description, isArabic && styles.arabicText]}>{introCopy}</Text>

          <View style={styles.capabilities}>
            <Text style={styles.capabilityText}>HUGGING FACE</Text>
            <View style={styles.capabilityDivider} />
            <Text style={styles.capabilityText}>GGUF</Text>
            <View style={styles.capabilityDivider} />
            <Text style={styles.capabilityText}>{isArabic ? 'خصوصية محلية' : 'PRIVATE BY DESIGN'}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={startLabel}
            onPress={leaveIntro}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={[styles.buttonText, isArabic && styles.arabicButtonText]}>{startLabel}</Text>
            <Text style={[styles.buttonArrow, isArabic && styles.buttonArrowRtl]}>
              {isArabic ? '←' : '→'}
            </Text>
          </Pressable>
          <Text style={[styles.hint, isArabic && styles.arabicText]}>
            {isArabic ? 'اسحب الشعار لتجربة العمق ثلاثي الأبعاد' : 'Drag the emblem to feel the depth'}
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08090D',
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08090D',
    paddingHorizontal: 24,
  },
  topGlow: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    top: -170,
    backgroundColor: '#7F101A',
    opacity: 0.28,
  },
  bottomGlow: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 145,
    bottom: -190,
    backgroundColor: '#5C0B15',
    opacity: 0.23,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 480,
  },
  eyebrowRow: {
    minHeight: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 91, 103, 0.22)',
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(255, 60, 76, 0.06)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF4858',
    marginRight: 8,
  },
  eyebrow: {
    color: '#E9878F',
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  artworkStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(238, 53, 69, 0.72)',
    borderRadius: 999,
    shadowColor: '#ED273A',
    shadowOpacity: 0.72,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  orbitInner: {
    position: 'absolute',
    width: '86%',
    height: '86%',
    borderWidth: 1,
    borderColor: 'rgba(249, 70, 83, 0.16)',
    borderRadius: 999,
  },
  logoCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 114, 122, 0.48)',
    overflow: 'hidden',
    backgroundColor: '#08090D',
    shadowColor: '#F22F42',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B0B10',
  },
  logoFallbackText: {
    color: '#FF4858',
    fontSize: 72,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  depthLabel: {
    position: 'absolute',
    right: 7,
    bottom: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 96, 0.36)',
    backgroundColor: '#16090C',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  depthLabelText: {
    color: '#FF7C87',
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  title: {
    color: '#F7F4F4',
    fontSize: 27,
    lineHeight: 36,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
    marginTop: 1,
  },
  description: {
    color: '#A9A6AA',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 8,
  },
  capabilities: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
    marginBottom: 17,
    paddingHorizontal: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  capabilityText: {
    color: '#B3AEB1',
    fontSize: 8,
    letterSpacing: 0.75,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  capabilityDivider: {
    height: 11,
    width: 1,
    marginHorizontal: 8,
    backgroundColor: 'rgba(255, 91, 103, 0.48)',
  },
  button: {
    width: '100%',
    maxWidth: 320,
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C91F32',
    borderWidth: 1,
    borderColor: '#EF4656',
    shadowColor: '#E32136',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 9,
  },
  buttonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
  },
  arabicButtonText: {
    fontFamily: 'sans-serif-medium',
  },
  buttonArrow: {
    color: '#FFFFFF',
    fontSize: 21,
    marginLeft: 12,
    marginTop: -2,
  },
  buttonArrowRtl: {
    marginLeft: 0,
    marginRight: 12,
  },
  hint: {
    color: '#777278',
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 10,
    marginTop: 11,
    textAlign: 'center',
  },
  arabicText: {
    fontFamily: 'sans-serif',
    writingDirection: 'rtl',
  },
});
