import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/app_design_system.dart';

/// Local-only skin face preview. It crops the actual head-front pixels instead of stretching the full skin atlas.
class VoxelImage extends StatefulWidget {
  const VoxelImage({super.key, this.path, this.size = 54, this.rounded = true});

  final String? path;
  final double size;
  final bool rounded;

  @override
  State<VoxelImage> createState() => _VoxelImageState();
}

class _VoxelImageState extends State<VoxelImage> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  ui.Image? _image;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolveImage();
  }

  @override
  void didUpdateWidget(covariant VoxelImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path) _resolveImage();
  }

  void _resolveImage() {
    if (_stream != null && _listener != null) _stream!.removeListener(_listener!);
    _stream = null;
    _listener = null;
    _image = null;
    final String path = widget.path ?? '';
    if (path.isEmpty) return;
    final ImageStream stream = FileImage(File(path)).resolve(createLocalImageConfiguration(context));
    final ImageStreamListener listener = ImageStreamListener((ImageInfo info, bool synchronousCall) {
      if (mounted) setState(() => _image = info.image);
    }, onError: (Object error, StackTrace? stackTrace) {
      if (mounted) setState(() => _image = null);
    });
    _stream = stream;
    _listener = listener;
    stream.addListener(listener);
  }

  @override
  void dispose() {
    if (_stream != null && _listener != null) _stream!.removeListener(_listener!);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double size = widget.size;
    final BorderRadius radius = BorderRadius.circular(widget.rounded ? size * .24 : 0);
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
      child: _image == null
          ? const Center(child: Icon(Icons.face_retouching_natural_rounded, color: AppColors.cyan))
          : CustomPaint(size: Size.square(size), painter: _SkinFacePainter(_image!)),
    );
  }
}

class _SkinFacePainter extends CustomPainter {
  const _SkinFacePainter(this.image);
  final ui.Image image;

  @override
  void paint(Canvas canvas, Size size) {
    final double width = image.width.toDouble();
    final double height = image.height.toDouble();
    if (width < 48 || height < 16) return;
    final Paint paint = Paint()..filterQuality = FilterQuality.none;
    final Rect destination = Offset.zero & size;
    canvas.drawImageRect(image, Rect.fromLTWH(8, 8, 8, 8), destination, paint);
    // The outer head UV differs between legacy 64x32 and modern 64x64 skins.
    if (width >= 48 && height >= 32) {
      final Rect overlay = height >= 64 ? Rect.fromLTWH(40, 8, 8, 8) : Rect.fromLTWH(32, 0, 8, 8);
      canvas.drawImageRect(image, overlay, destination, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SkinFacePainter oldDelegate) => oldDelegate.image != image;
}
