import 'package:flutter/material.dart';

import '../theme/app_design_system.dart';

/// Original, non-texture voxel-style icon. It intentionally does not package Minecraft artwork.
class VoxelItemIcon extends StatelessWidget {
  const VoxelItemIcon({super.key, required this.itemId, this.size = 34});

  final String itemId;
  final double size;

  @override
  Widget build(BuildContext context) {
    final String normalizedId = itemId.startsWith('minecraft:') ? itemId.substring('minecraft:'.length) : itemId;
    final Color color = _colorFor(normalizedId);
    final IconData icon = _iconFor(normalizedId);
    final bool block = _isBlockLike(normalizedId);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * .2),
        color: AppColors.backgroundRaised,
        border: Border.all(color: color.withValues(alpha: .5)),
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: <Color>[color.withValues(alpha: .28), AppColors.backgroundRaised]),
      ),
      child: block
          ? CustomPaint(painter: _VoxelBlockPainter(color: color, seed: normalizedId), size: Size.square(size))
          : Center(child: Icon(icon, size: size * .55, color: color)),
    );
  }

  static bool _isBlockLike(String id) => RegExp(r'(?:_block|_ore|_log|_wood|_planks|_stone|^(?:dirt|grass|sand|gravel|mud|netherrack|obsidian|clay|glass|stone|cobblestone|bedrock|snow|ice)$)').hasMatch(id);

  static IconData _iconFor(String id) {
    if (id.contains('pickaxe') || id.contains('axe') || id.contains('shovel') || id.contains('sword') || id.contains('hoe')) return Icons.construction_rounded;
    if (id.contains('diamond') || id.contains('emerald') || id.contains('quartz') || id.contains('amethyst')) return Icons.diamond_rounded;
    if (id.contains('apple') || id.contains('bread') || id.contains('beef') || id.contains('carrot') || id.contains('potato') || id.contains('fish')) return Icons.restaurant_rounded;
    if (id.contains('ingot') || id.contains('nugget') || id.contains('raw_')) return Icons.token_rounded;
    if (id.contains('coal') || id.contains('charcoal')) return Icons.local_fire_department_rounded;
    if (id.contains('redstone')) return Icons.bolt_rounded;
    if (id.contains('book')) return Icons.menu_book_rounded;
    if (id.contains('helmet') || id.contains('chestplate') || id.contains('leggings') || id.contains('boots')) return Icons.shield_rounded;
    if (id.contains('torch')) return Icons.lightbulb_rounded;
    if (id.contains('sapling') || id.contains('leaves') || id.contains('flower') || id.contains('grass')) return Icons.eco_rounded;
    return Icons.widgets_rounded;
  }

  static Color _colorFor(String id) {
    if (id.contains('diamond') || id.contains('prismarine')) return const Color(0xFF53E5DE);
    if (id.contains('emerald') || id.contains('leaves') || id.contains('moss') || id.contains('grass')) return const Color(0xFF65D88A);
    if (id.contains('gold') || id.contains('wheat') || id.contains('sand') || id.contains('hay')) return const Color(0xFFF2C85B);
    if (id == 'dirt' || id == 'mud' || id.contains('podzol')) return const Color(0xFFB98765);
    if (id.contains('iron') || id.contains('stone') || id.contains('deepslate') || id.contains('cobble')) return const Color(0xFFB6C1D5);
    if (id.contains('coal') || id.contains('obsidian') || id.contains('blackstone')) return const Color(0xFF9295B6);
    if (id.contains('redstone') || id.contains('nether') || id.contains('lava')) return const Color(0xFFFF7869);
    if (id.contains('wood') || id.contains('log') || id.contains('planks') || id.contains('bamboo')) return const Color(0xFFC99562);
    if (id.contains('food') || id.contains('apple') || id.contains('bread') || id.contains('beef') || id.contains('carrot')) return const Color(0xFFFFAC6F);
    if (id.contains('clay') || id.contains('quartz') || id.contains('snow') || id.contains('wool')) return const Color(0xFFD8E1E9);
    return AppColors.cyan;
  }
}

class _VoxelBlockPainter extends CustomPainter {
  const _VoxelBlockPainter({required this.color, required this.seed});

  final Color color;
  final String seed;

  @override
  void paint(Canvas canvas, Size size) {
    final double u = size.shortestSide;
    final Paint fill = Paint()..style = PaintingStyle.fill;
    final Paint edge = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = (u * .035).clamp(1, 1.5).toDouble()
      ..color = Colors.white.withValues(alpha: .62);
    final Path top = Path()
      ..moveTo(u * .5, u * .12)
      ..lineTo(u * .87, u * .31)
      ..lineTo(u * .5, u * .51)
      ..lineTo(u * .13, u * .31)
      ..close();
    final Path left = Path()
      ..moveTo(u * .13, u * .31)
      ..lineTo(u * .5, u * .51)
      ..lineTo(u * .5, u * .88)
      ..lineTo(u * .13, u * .68)
      ..close();
    final Path right = Path()
      ..moveTo(u * .87, u * .31)
      ..lineTo(u * .5, u * .51)
      ..lineTo(u * .5, u * .88)
      ..lineTo(u * .87, u * .68)
      ..close();

    fill.color = Color.lerp(color, Colors.white, .28)!;
    canvas.drawPath(top, fill);
    fill.color = Color.lerp(color, Colors.black, .08)!;
    canvas.drawPath(left, fill);
    fill.color = Color.lerp(color, Colors.black, .24)!;
    canvas.drawPath(right, fill);

    final List<int> code = seed.codeUnits;
    canvas.save();
    canvas.clipPath(top);
    _drawPixels(canvas, u, code, Color.lerp(color, Colors.white, .4)!);
    canvas.restore();
    canvas.save();
    canvas.clipPath(left);
    _drawPixels(canvas, u, code.reversed.toList(growable: false), Color.lerp(color, Colors.white, .12)!);
    canvas.restore();
    canvas.save();
    canvas.clipPath(right);
    _drawPixels(canvas, u, code, Color.lerp(color, Colors.black, .12)!);
    canvas.restore();

    canvas.drawPath(top, edge);
    canvas.drawPath(left, edge);
    canvas.drawPath(right, edge);
  }

  void _drawPixels(Canvas canvas, double u, List<int> code, Color tint) {
    if (code.isEmpty) return;
    final Paint pixel = Paint()..style = PaintingStyle.fill;
    final double cell = u * .115;
    for (int row = 0; row < 6; row++) {
      for (int column = 0; column < 6; column++) {
        final int value = code[(row * 7 + column * 3) % code.length];
        if ((value + row + column) % 4 == 0) continue;
        pixel.color = value.isEven ? tint.withValues(alpha: .34) : Colors.black.withValues(alpha: .12);
        canvas.drawRect(Rect.fromLTWH(u * .16 + column * cell, u * .16 + row * cell, cell * .82, cell * .82), pixel);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _VoxelBlockPainter oldDelegate) => oldDelegate.color != color || oldDelegate.seed != seed;
}
