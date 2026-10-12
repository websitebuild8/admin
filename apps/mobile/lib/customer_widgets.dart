import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'browse_widgets.dart' show browseInk, browseMuted, browseYellow;
import 'food_photo.dart';

/// Customer motion is finite and follows the device's Reduce Motion setting.
class CustomerEntrance extends StatelessWidget {
  final Widget child;
  const CustomerEntrance({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (_, value, child) => Opacity(
        opacity: value,
        child: Transform.translate(
          offset: Offset(0, 12 * (1 - value)),
          child: child,
        ),
      ),
    );
  }
}

class CustomerSearchField extends StatefulWidget {
  final ValueChanged<String> onChanged;
  final String? hint;
  final String value;
  const CustomerSearchField({
    super.key,
    required this.onChanged,
    this.hint,
    this.value = '',
  });
  @override
  State<CustomerSearchField> createState() => _CustomerSearchFieldState();
}

class _CustomerSearchFieldState extends State<CustomerSearchField> {
  late final controller = TextEditingController(text: widget.value);
  @override
  void didUpdateWidget(covariant CustomerSearchField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (controller.text != widget.value) {
      controller.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
    }
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    onChanged: widget.onChanged,
    textInputAction: TextInputAction.search,
    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
    decoration: InputDecoration(
      hintText: widget.hint ?? 'Search for restaurants or cuisines',
      hintStyle: const TextStyle(fontSize: 13, color: browseMuted),
      prefixIcon: const Icon(CupertinoIcons.search, size: 21, color: browseInk),
      suffixIcon: widget.value.isEmpty
          ? null
          : IconButton(
              tooltip: 'Clear search',
              onPressed: () => widget.onChanged(''),
              icon: const Icon(
                CupertinoIcons.xmark_circle_fill,
                size: 18,
                color: browseMuted,
              ),
            ),
      filled: true,
      fillColor: Colors.white.withValues(alpha: .92),
      contentPadding: const EdgeInsets.symmetric(vertical: 17, horizontal: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE8E8EB)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: browseInk, width: 1.3),
      ),
    ),
  );
}

class IslandDiscoveryBanner extends StatelessWidget {
  final VoidCallback onTap;
  final bool preview;
  const IslandDiscoveryBanner({
    super.key,
    required this.onTap,
    this.preview = false,
  });

  @override
  Widget build(BuildContext context) => CustomerEntrance(
    child: Material(
      color: const Color(0xFFFFF2AA),
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 154),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFFFFF6C9), Color(0xFFFFE76B)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                flex: 6,
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'GOOD FOOD. CLOSE TO HOME.',
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 9),
                      const Text(
                        'Little cravings.\nBig happiness.',
                        style: TextStyle(
                          fontSize: 25,
                          height: 1.08,
                          letterSpacing: -.9,
                          fontWeight: FontWeight.w900,
                          color: browseInk,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              preview
                                  ? 'Explore The Cafe'
                                  : 'Find your coffee fix',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(CupertinoIcons.arrow_right, size: 15),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                flex: 4,
                child: preview
                    ? ClipRRect(
                        borderRadius: const BorderRadius.horizontal(
                          left: Radius.circular(70),
                        ),
                        child: Image.asset(
                          'assets/food/cafe-preview.png',
                          height: 180,
                          fit: BoxFit.cover,
                          alignment: Alignment.centerRight,
                          semanticLabel: 'Sample café food photography',
                        ),
                      )
                    : const Padding(
                        padding: EdgeInsets.all(18),
                        child: Icon(
                          Icons.coffee_rounded,
                          size: 68,
                          color: browseInk,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class CustomerToolbar extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const CustomerToolbar({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 6, 4, 18),
    child: Row(
      children: [
        IconButton(
          tooltip: 'Back',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(CupertinoIcons.arrow_left, size: 23),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: const TextStyle(fontSize: 11, color: browseMuted),
                ),
            ],
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

class CustomerAccountIdentity extends StatelessWidget {
  final String name, caption;
  const CustomerAccountIdentity({
    super.key,
    required this.name,
    required this.caption,
  });
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: const Color(0xFFFFF1AE),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(CupertinoIcons.person, size: 26, color: browseInk),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name,
              style: const TextStyle(
                fontSize: 21,
                fontWeight: FontWeight.w800,
                letterSpacing: -.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              caption,
              style: const TextStyle(fontSize: 12, color: browseMuted),
            ),
          ],
        ),
      ),
    ],
  );
}

class RestaurantMenuHeader extends StatelessWidget {
  final String name, subtitle, detail;
  final bool preview;
  const RestaurantMenuHeader({
    super.key,
    required this.name,
    required this.subtitle,
    required this.detail,
    this.preview = false,
  });

  @override
  Widget build(BuildContext context) => CustomerEntrance(
    child: Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .92),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFEDEDEF)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x09000000),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'FRESH FROM THE KITCHEN',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.3,
              color: browseMuted,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            name,
            style: const TextStyle(
              fontSize: 29,
              height: 1.1,
              letterSpacing: -1,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: browseMuted),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: Divider(height: 1, color: Color(0xFFEEEEF1)),
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: const BoxDecoration(
                  color: Color(0xFFFFF5BC),
                  shape: BoxShape.circle,
                ),
                child: const Icon(CupertinoIcons.time, size: 16),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  detail,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (preview)
                const Text(
                  'SAMPLE',
                  style: TextStyle(
                    fontSize: 9,
                    color: browseMuted,
                    letterSpacing: 1,
                  ),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

class CustomerMenuItem extends StatelessWidget {
  final String name, description, amount;
  final Map<String, dynamic>? image;
  final String? sampleAsset;
  final int quantity;
  final VoidCallback? onAdd, onRemove;
  const CustomerMenuItem({
    super.key,
    required this.name,
    required this.description,
    required this.amount,
    this.image,
    this.sampleAsset,
    required this.quantity,
    this.onAdd,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 20),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0xFFE9E9ED))),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.3,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                amount,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 9),
              Text(
                description,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.45,
                  color: browseMuted,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        SizedBox(
          width: 112,
          child: Column(
            children: [
              if (sampleAsset != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.asset(
                    sampleAsset!,
                    height: 96,
                    width: 112,
                    fit: BoxFit.cover,
                    alignment: Alignment.centerRight,
                    semanticLabel: 'Sample $name photography',
                  ),
                )
              else
                FoodPhoto(image: image, label: name, size: 104),
              Transform.translate(
                offset: const Offset(0, -11),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBE9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE7D779)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x10000000),
                        blurRadius: 8,
                        offset: Offset(0, 3),
                      ),
                    ],
                  ),
                  child: quantity == 0
                      ? SizedBox(
                          width: 100,
                          height: 42,
                          child: TextButton(
                            onPressed: onAdd,
                            style: TextButton.styleFrom(
                              foregroundColor: browseInk,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Tooltip(
                              message: 'Add $name',
                              child: const Text(
                                'ADD +',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: .5,
                                ),
                              ),
                            ),
                          ),
                        )
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 36,
                              height: 44,
                              child: IconButton(
                                padding: EdgeInsets.zero,
                                tooltip: 'Remove $name',
                                onPressed: onRemove,
                                icon: const Icon(
                                  CupertinoIcons.minus,
                                  size: 15,
                                ),
                              ),
                            ),
                            AnimatedSwitcher(
                              duration: MediaQuery.disableAnimationsOf(context)
                                  ? Duration.zero
                                  : const Duration(milliseconds: 150),
                              child: Text(
                                '$quantity',
                                key: ValueKey(quantity),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            SizedBox(
                              width: 36,
                              height: 44,
                              child: IconButton(
                                padding: EdgeInsets.zero,
                                tooltip: 'Add $name',
                                onPressed: onAdd,
                                icon: const Icon(CupertinoIcons.plus, size: 15),
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class CustomerCartBar extends StatelessWidget {
  final int count;
  final String amount;
  final VoidCallback? onTap;
  const CustomerCartBar({
    super.key,
    required this.count,
    required this.amount,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(18),
    child: BackdropFilter(
      filter: ImageFilter.blur(
        sigmaX:
            MediaQuery.highContrastOf(context) ||
                MediaQuery.disableAnimationsOf(context)
            ? 0
            : 18,
        sigmaY:
            MediaQuery.highContrastOf(context) ||
                MediaQuery.disableAnimationsOf(context)
            ? 0
            : 18,
      ),
      child: FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          backgroundColor: browseYellow.withValues(alpha: .85),
          foregroundColor: browseInk,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '$count ${count == 1 ? 'item' : 'items'} added',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    amount,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            const Text(
              'View cart',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 8),
            const Icon(CupertinoIcons.bag, size: 21),
          ],
        ),
      ),
    ),
  );
}

class CustomerOrderCard extends StatelessWidget {
  final String restaurant, items, status, reference, estimate, amount;
  final Widget progress;
  final VoidCallback onTap;
  const CustomerOrderCard({
    super.key,
    required this.restaurant,
    required this.items,
    required this.status,
    required this.reference,
    required this.estimate,
    required this.amount,
    required this.progress,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .88),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: const Color(0xFFE9E9ED)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF5C7),
                borderRadius: BorderRadius.circular(15),
              ),
              child: const Icon(CupertinoIcons.bag, size: 23),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    restaurant,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    reference,
                    style: const TextStyle(fontSize: 10, color: browseMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Text(
          items,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 12, color: browseMuted, height: 1.5),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Text(
                status,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              amount,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ],
        ),
        const SizedBox(height: 14),
        progress,
        if (estimate.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Text(
              estimate,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: onTap,
          style: OutlinedButton.styleFrom(
            foregroundColor: browseInk,
            backgroundColor: const Color(0xFFFFF9DA),
            side: const BorderSide(color: Color(0xFFEBDD94)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            minimumSize: const Size(double.infinity, 46),
          ),
          child: const Text(
            'View order progress',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    ),
  );
}
