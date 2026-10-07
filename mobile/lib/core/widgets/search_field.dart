import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../theme/app_design_system.dart';

class SearchField extends StatelessWidget {
  const SearchField({super.key, required this.controller, this.onChanged, this.hint});

  final TextEditingController controller;
  final ValueChanged<String>? onChanged;
  final String? hint;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search_rounded, color: AppColors.cyan),
          hintText: hint ?? AppLocalizations.of(context).search,
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  tooltip: AppLocalizations.of(context).dismiss,
                  onPressed: () {
                    controller.clear();
                    onChanged?.call('');
                  },
                  icon: const Icon(Icons.close_rounded),
                ),
        ),
      );
}
