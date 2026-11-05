import {
  MD3DarkTheme,
  DefaultTheme as PaperLightTheme,
  configureFonts,
} from 'react-native-paper';
import { MD3BaseColors, SemanticColors, Theme, AnythingLLMColorways } from './types';
import { brandPalette, withOpacity, stateLayerOpacity } from './colorUtils';
import { StyleSheet } from 'react-native';

// MD3 key colors (seed colors)
const md3BaseColors: Partial<MD3BaseColors> = {
  primary: brandPalette.primary,
  secondary: brandPalette.secondary,
  tertiary: brandPalette.accent,
  error: brandPalette.accent,
};

const AnythingLLMColors = (_isDark: boolean = false) => {
  // TODO: add light theme colors
  const darkThemeColors = {
    text: {
      primary: '#FFFFFF',
      secondary: '#E2E2E2',
    },
    background: {
      primary: brandPalette.background,
      secondary: brandPalette.surface,
      ctaBlue: brandPalette.primary,
      ctaBlueProgressBar: brandPalette.accent,
      ctaLightBlue: brandPalette.secondary,
    },
  };

  return darkThemeColors;
};

type ApplicationColors = MD3BaseColors & { anythingllm: AnythingLLMColorways };
const createBaseColors = (isDark: boolean): ApplicationColors => {
  const baseTheme = isDark ? MD3DarkTheme : PaperLightTheme;

  if (isDark) {
    return {
      ...baseTheme.colors,
      anythingllm: AnythingLLMColors(isDark),
      primary: brandPalette.primary,
      onPrimary: '#FFFFFF',
      primaryContainer: brandPalette.secondary,
      onPrimaryContainer: '#FFF1F2',
      secondary: brandPalette.secondary,
      onSecondary: '#FFFFFF',
      secondaryContainer: brandPalette.secondary,
      onSecondaryContainer: '#FEE2E2',
      tertiary: brandPalette.accent,
      onTertiary: '#FFFFFF',
      tertiaryContainer: brandPalette.secondary,
      onTertiaryContainer: '#FEE2E2',
      error: md3BaseColors.error!,
      onError: '#FFFFFF',
      errorContainer: brandPalette.secondary,
      onErrorContainer: '#FEE2E2',
      background: brandPalette.background,
      onBackground: '#FFFFFF',
      surface: brandPalette.surface,
      onSurface: '#E2E2E2',
      surfaceVariant: '#292929',
      onSurfaceVariant: '#E2E2E2',
      outline: '#525252',
      outlineVariant: '#737373',
      // Additional required MD3 colors
      surfaceDisabled: withOpacity('#333333', 0.12),
      onSurfaceDisabled: withOpacity('#e5e5e6', 0.38),
      inverseSurface: '#e5e5e6',
      inverseOnSurface: '#333333',
      inversePrimary: brandPalette.primary,
      inverseSecondary: md3BaseColors.secondary!,
      shadow: '#ffffff',
      scrim: 'rgba(0, 0, 0, 0.25)',
      backdrop: 'rgba(38, 37, 37, 0.8)',
    };
  }

  return {
    ...baseTheme.colors,
    anythingllm: AnythingLLMColors(isDark),
    primary: md3BaseColors.primary!,
    onPrimary: '#FFFFFF',
    primaryContainer: '#FEE2E2',
    onPrimaryContainer: brandPalette.secondary,
    secondary: md3BaseColors.secondary!,
    onSecondary: '#FFFFFF',
    secondaryContainer: '#FEE2E2',
    onSecondaryContainer: brandPalette.secondary,
    tertiary: md3BaseColors.tertiary!,
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FEE2E2',
    onTertiaryContainer: brandPalette.secondary,
    error: md3BaseColors.error!,
    onError: '#FFFFFF',
    errorContainer: '#FEE2E2',
    onErrorContainer: brandPalette.secondary,
    background: '#ffffff',
    onBackground: '#111111',
    surface: '#F9FAFB',
    onSurface: '#333333',
    surfaceVariant: '#e4e4e6',
    onSurfaceVariant: '#646466',
    outline: withOpacity(md3BaseColors.primary!, 0.05),
    outlineVariant: '#a1a1a1',
    // Additional required MD3 colors
    surfaceDisabled: withOpacity('#fcfcfc', 0.12),
    onSurfaceDisabled: withOpacity('#333333', 0.38),
    inverseSurface: '#858585',
    inverseOnSurface: '#fcfcfc',
    inversePrimary: brandPalette.primary,
    inverseSecondary: brandPalette.secondary,
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.25)',
    backdrop: 'rgba(51, 51, 51, 0.6)',
  };
};

const createSemanticColors = (
  baseColors: MD3BaseColors,
  isDark: boolean,
): SemanticColors => ({
  // Surface variants
  surfaceContainerHighest: isDark
    ? withOpacity(baseColors.surface, 0.22)
    : withOpacity(baseColors.primary, 0.05),
  surfaceContainerHigh: isDark
    ? withOpacity(baseColors.surface, 0.16)
    : withOpacity(baseColors.primary, 0.03),
  surfaceContainer: isDark
    ? withOpacity(baseColors.surface, 0.12)
    : withOpacity(baseColors.primary, 0.02),
  surfaceContainerLow: isDark
    ? withOpacity(baseColors.surface, 0.08)
    : withOpacity(baseColors.primary, 0.01),
  surfaceContainerLowest: isDark
    ? withOpacity(baseColors.surface, 0.04)
    : baseColors.surface,
  surfaceDim: isDark
    ? withOpacity(baseColors.surface, 0.06)
    : withOpacity(baseColors.primary, 0.06),
  surfaceBright: isDark
    ? withOpacity(baseColors.surface, 0.24)
    : baseColors.surface,

  border: withOpacity(baseColors.onSurface, 0.05),
  placeholder: withOpacity(baseColors.onSurface, 0.3),
  text: baseColors.onBackground,
  textSecondary: withOpacity(baseColors.onSurface, 0.5),
  inverseText: baseColors.inverseOnSurface,
  inverseTextSecondary: withOpacity(baseColors.inverseOnSurface, 0.5),

  // Interactive states
  stateLayerOpacity: 0.12,
  hoverStateOpacity: stateLayerOpacity.hover,
  pressedStateOpacity: stateLayerOpacity.pressed,
  draggedStateOpacity: stateLayerOpacity.dragged,
  focusStateOpacity: stateLayerOpacity.focus,

  // Menu specific
  menuBackground: isDark ? '#2a2a2a' : baseColors.surface,
  menuBackgroundDimmed: withOpacity(baseColors.surface, 0.9),
  menuBackgroundActive: withOpacity(baseColors.primary, 0.08),
  menuSeparator: withOpacity(baseColors.primary, 0.5),
  menuGroupSeparator: isDark
    ? withOpacity('#FFFFFF', 0.08)
    : withOpacity('#000000', 0.08),
  menuText: baseColors.onSurface,
  menuDangerText: baseColors.error,

  // Message specific
  authorBubbleBackground: isDark ? '#212121' : '#f2f2f2',
  receivedMessageDocumentIcon: baseColors.primary,
  sentMessageDocumentIcon: baseColors.onSurface,
  userAvatarImageBackground: 'transparent',
  userAvatarNameColors: [
    baseColors.primary,
    baseColors.secondary,
    baseColors.tertiary,
    baseColors.error,
  ],
  searchBarBackground: isDark
    ? 'rgba(28, 28, 30, 0.92)'
    : 'rgba(118, 118, 128, 0.12)',

  // Thinking bubble specific
  thinkingBubbleBackground: isDark ? '#2A1013' : '#FFF1F2',
  thinkingBubbleText: isDark ? '#FF8A8F' : brandPalette.secondary,
  thinkingBubbleBorder: isDark
    ? 'rgba(220, 38, 38, 0.6)'
    : 'rgba(190, 18, 60, 0.4)',
  thinkingBubbleShadow: isDark ? brandPalette.accent : brandPalette.secondary,
  thinkingBubbleChevronBackground: isDark
    ? 'rgba(220, 38, 38, 0.15)'
    : 'rgba(190, 18, 60, 0.1)',
  thinkingBubbleChevronBorder: isDark
    ? 'rgba(220, 38, 38, 0.3)'
    : 'rgba(190, 18, 60, 0.2)',
});

export const fontStyles = {
  regular: { fontFamily: 'Inter-Regular' },
  medium: { fontFamily: 'Inter-Medium' },
  bold: { fontFamily: 'Inter-Bold' },
  thin: { fontFamily: 'Inter-Thin' },
  light: { fontFamily: 'Inter-Light' },
  semibold: { fontFamily: 'Inter-SemiBold' },
  extraBold: { fontFamily: 'Inter-ExtraBold' },
  // Brand display face - headlines only (e.g. the empty chat greeting).
  display: { fontFamily: 'ClashDisplay-Medium' },
};

const baseFontVariants = configureFonts({
  config: { ...fontStyles.regular },
});

const customVariants = {
  // Add custom variants:
  bold: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.bold,
  },
  medium: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.medium,
  },
  thin: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.thin,
  },
  light: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.light,
  },
  semibold: {
    ...baseFontVariants.bodyMedium,
    ...fontStyles.semibold,
  },
} as const;

const configuredFonts = configureFonts({
  config: {
    ...baseFontVariants,
    ...customVariants,
    displayMedium: {
      ...baseFontVariants.displayMedium,
      ...fontStyles.bold,
    },
    titleSmall: {
      ...baseFontVariants.titleSmall,
      ...fontStyles.medium,
    },
  },
});

const createTheme = (isDark: boolean): Theme & { colors: ApplicationColors } => {
  const baseTheme = isDark ? MD3DarkTheme : PaperLightTheme;
  const baseColors = createBaseColors(isDark);
  const semanticColors = createSemanticColors(baseColors, isDark);

  return {
    ...baseTheme,
    colors: {
      ...baseColors,
      ...semanticColors,
    },
    borders: {
      inputBorderRadius: 16,
      messageBorderRadius: 15,
      default: 12,
    },
    fonts: {
      ...baseTheme.fonts,
      ...configuredFonts,
      titleMediumLight: {
        ...fontStyles.regular,
        fontSize: 16,
        lineHeight: 22,
      },
      dateDividerTextStyle: {
        ...fontStyles.extraBold,
        color: baseColors.onSurface,
        fontSize: 12,
        lineHeight: 16,
        opacity: 0.4,
      },
      emptyChatPlaceholderTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      inputTextStyle: {
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      receivedMessageBodyTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      receivedMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.medium,
      },
      receivedMessageLinkDescriptionTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 14,
        lineHeight: 20,
        ...fontStyles.regular,
      },
      receivedMessageLinkTitleTextStyle: {
        color: baseColors.onPrimary,
        fontSize: 16,
        lineHeight: 22,
        ...fontStyles.extraBold,
      },
      sentMessageBodyTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 24,
        ...fontStyles.medium,
      },
      sentMessageCaptionTextStyle: {
        color: baseColors.onSurfaceVariant,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.medium,
      },
      sentMessageLinkDescriptionTextStyle: {
        color: baseColors.onSurface,
        fontSize: 14,
        lineHeight: 20,
        ...fontStyles.regular,
      },
      sentMessageLinkTitleTextStyle: {
        color: baseColors.onSurface,
        fontSize: 16,
        lineHeight: 22,
        ...fontStyles.extraBold,
      },
      userAvatarTextStyle: {
        color: baseColors.onSurface,
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.extraBold,
      },
      userNameTextStyle: {
        fontSize: 12,
        lineHeight: 16,
        ...fontStyles.extraBold,
      },
    },
    insets: {
      messageInsetsHorizontal: 20,
      messageInsetsVertical: 10,
    },
    spacing: {
      default: 16,
    },
    icons: {},
  };
};

export const lightTheme = createTheme(false);
export const darkTheme = createTheme(true);
export const rootStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    headerWithoutDivider: {
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: theme.colors.background,
    },
    headerWithDivider: {
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      ...theme.fonts.titleSmall,
    },
  });
