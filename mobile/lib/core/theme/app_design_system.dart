import 'package:flutter/material.dart';

abstract final class AppColors {
  static const background = Color(0xFF050714);
  static const backgroundRaised = Color(0xFF0B1022);
  static const surface = Color(0xD9141B32);
  static const surfaceRaised = Color(0xF01B2441);
  static const surfaceMuted = Color(0xFF11182D);
  static const cyan = Color(0xFF4DE4FF);
  static const blue = Color(0xFF3F91FF);
  static const purple = Color(0xFFB05CFF);
  static const purpleDeep = Color(0xFF6B37D8);
  static const green = Color(0xFF55E5AE);
  static const amber = Color(0xFFFFC66D);
  static const red = Color(0xFFFF6B86);
  static const text = Color(0xFFF2F6FF);
  static const textMuted = Color(0xFF9EACCC);
  static const outline = Color(0x554DE4FF);
  static const disabled = Color(0xFF66708B);
}

abstract final class AppSpacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const page = 18.0;
  static const section = 20.0;
}

abstract final class AppRadius {
  static const sm = 10.0;
  static const md = 15.0;
  static const lg = 19.0;
  static const xl = 24.0;
  static const pill = 100.0;
}

abstract final class AppShadows {
  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x22000000), blurRadius: 18, offset: Offset(0, 8)),
  ];
  static const glowCyan = <BoxShadow>[
    BoxShadow(color: Color(0x294DE4FF), blurRadius: 17, spreadRadius: -6),
  ];
  static const glowPurple = <BoxShadow>[
    BoxShadow(color: Color(0x26B05CFF), blurRadius: 18, spreadRadius: -6),
  ];
}

abstract final class AppGradients {
  static const accent = LinearGradient(
    begin: AlignmentDirectional.centerStart,
    end: AlignmentDirectional.centerEnd,
    colors: <Color>[Color(0xFF6738DA), Color(0xFF276DEB), Color(0xFF1599C9)],
  );
  static const card = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: <Color>[Color(0xF01B2545), Color(0xE810172E)],
  );
  static const welcome = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: <Color>[Color(0x102D1B86), Color(0xC9050715), Color(0xFF050714)],
    stops: <double>[0, .58, 1],
  );
  static const success = LinearGradient(
    colors: <Color>[Color(0xFF119D7C), Color(0xFF40D6A2)],
  );
  static const danger = LinearGradient(
    colors: <Color>[Color(0xFFB72454), Color(0xFFE84E68)],
  );
}

abstract final class AppTypography {
  static TextStyle get display => const TextStyle(
        fontSize: 30,
        height: 1.13,
        fontWeight: FontWeight.w800,
        letterSpacing: -.5,
        color: AppColors.text,
      );
  static TextStyle get headline => const TextStyle(
        fontSize: 22,
        height: 1.2,
        fontWeight: FontWeight.w700,
        color: AppColors.text,
      );
  static TextStyle get title => const TextStyle(
        fontSize: 16,
        height: 1.25,
        fontWeight: FontWeight.w700,
        color: AppColors.text,
      );
  static TextStyle get body => const TextStyle(
        fontSize: 14,
        height: 1.42,
        fontWeight: FontWeight.w400,
        color: AppColors.text,
      );
  static TextStyle get label => const TextStyle(
        fontSize: 12,
        height: 1.25,
        fontWeight: FontWeight.w600,
        color: AppColors.textMuted,
      );
  static TextStyle get micro => const TextStyle(
        fontSize: 10,
        height: 1.2,
        fontWeight: FontWeight.w700,
        letterSpacing: .65,
        color: AppColors.textMuted,
      );
}

abstract final class AppMotion {
  static const fast = Duration(milliseconds: 150);
  static const standard = Duration(milliseconds: 240);
  static const emphasized = Duration(milliseconds: 360);
  static const page = Duration(milliseconds: 280);
  static const curve = Curves.easeOutCubic;
  static const emphasizedCurve = Curves.easeInOutCubicEmphasized;

  static Duration reduceMotion(BuildContext context, Duration duration) =>
      MediaQuery.maybeOf(context)?.disableAnimations == true
          ? Duration.zero
          : duration;
}

abstract final class AppIcons {
  static const home = Icons.grid_view_rounded;
  static const bots = Icons.smart_toy_outlined;
  static const tasks = Icons.checklist_rounded;
  static const servers = Icons.dns_rounded;
  static const settings = Icons.tune_rounded;
  static const ai = Icons.auto_awesome_rounded;
  static const inventory = Icons.inventory_2_outlined;
  static const skin = Icons.face_retouching_natural_rounded;
  static const warning = Icons.warning_amber_rounded;
}

ThemeData buildAppTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: AppColors.cyan,
    brightness: Brightness.dark,
    surface: AppColors.backgroundRaised,
    primary: AppColors.cyan,
    secondary: AppColors.purple,
    error: AppColors.red,
  ).copyWith(
    surface: AppColors.backgroundRaised,
    surfaceContainerHighest: AppColors.surfaceRaised,
    onSurface: AppColors.text,
    onSurfaceVariant: AppColors.textMuted,
    primaryContainer: const Color(0xFF133B55),
    onPrimaryContainer: AppColors.cyan,
    secondaryContainer: const Color(0xFF382454),
    onSecondaryContainer: AppColors.text,
    outline: AppColors.outline,
  );
  final TextTheme textTheme = ThemeData.dark().textTheme.apply(
        bodyColor: AppColors.text,
        displayColor: AppColors.text,
        fontFamily: 'sans-serif',
      );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    canvasColor: AppColors.background,
    textTheme: textTheme,
    dividerColor: AppColors.outline,
    splashFactory: InkSparkle.splashFactory,
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.surfaceRaised,
      contentTextStyle: const TextStyle(color: AppColors.text),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
    ),
    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: AppColors.surfaceMuted,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
      labelStyle: const TextStyle(color: AppColors.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: const BorderSide(color: AppColors.cyan, width: 1.5),
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppColors.outline),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.backgroundRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        side: const BorderSide(color: AppColors.outline),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.backgroundRaised,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surface,
      selectedColor: const Color(0xFF264777),
      disabledColor: AppColors.surfaceMuted,
      side: const BorderSide(color: AppColors.outline),
      labelStyle: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      secondaryLabelStyle: const TextStyle(color: AppColors.text),
      shape: const StadiumBorder(),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.transparent,
      indicatorColor: const Color(0x663D9BCE),
      elevation: 0,
      labelTextStyle: WidgetStateProperty.resolveWith<TextStyle?>((states) {
        final bool selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 10,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? AppColors.text : AppColors.textMuted,
        );
      }),
    ),
  );
}
