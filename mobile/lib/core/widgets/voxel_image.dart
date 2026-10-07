import 'dart:io';

import 'package:flutter/material.dart';

import '../theme/app_design_system.dart';

class VoxelImage extends StatelessWidget {
  const VoxelImage({super.key, this.path, this.size = 54, this.rounded = true});

  final String? path;
  final double size;
  final bool rounded;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(rounded ? size * .25 : 0);
    final Widget image = path == null || path!.isEmpty
        ? const Center(child: Icon(Icons.smart_toy_rounded, color: AppColors.cyan))
        : Image.file(File(path!), fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.smart_toy_rounded, color: AppColors.cyan)));
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: const LinearGradient(colors: <Color>[Color(0xFF14234C), Color(0xFF311D54)]),
        border: Border.all(color: AppColors.cyan.withValues(alpha: .62)),
        boxShadow: AppShadows.glowCyan,
      ),
      clipBehavior: Clip.antiAlias,
      child: image,
    );
  }
}
