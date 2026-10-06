import 'package:flutter/material.dart';

import 'native_glass_bar.dart';

const browseInk = Color(0xFF181918);
const browseMuted = Color(0xFF72756F);
const browseYellow = Color(0xFFFFDF35);

class FloatingWorkspace extends StatelessWidget {
  final Widget header, body;
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;
  const FloatingWorkspace({
    super.key,
    required this.header,
    required this.body,
    required this.labels,
    required this.selected,
    required this.onSelected,
  });
  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Column(
        children: [
          header,
          Expanded(child: body),
        ],
      ),
      Positioned(
        left: 16,
        right: 16,
        bottom: 12,
        child: NativeGlassBar(
          labels: labels,
          selected: selected,
          onSelected: onSelected,
        ),
      ),
    ],
  );
}

class SectionHeading extends StatelessWidget {
  final String title;
  final String? subtitle, action;
  final VoidCallback? onAction;
  const SectionHeading({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 14),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 23,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.6,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 5),
                Text(
                  subtitle!,
                  style: const TextStyle(fontSize: 12, color: browseMuted),
                ),
              ],
            ],
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            child: Text(action!, style: const TextStyle(fontSize: 12)),
          ),
      ],
    ),
  );
}

class DeliveryAddressHeader extends StatelessWidget {
  final String address, area;
  final VoidCallback onTap;
  const DeliveryAddressHeader({
    super.key,
    required this.address,
    required this.area,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Delivery · Now',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: browseMuted,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.place, size: 18),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -.4,
                        ),
                      ),
                    ),
                    const Icon(Icons.expand_more, size: 19),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .8),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFE8E8E4)),
        ),
        child: Text(
          area,
          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
    ],
  );
}

/// Only cuisines supported by the real catalog are offered as shortcuts.
class CuisineFilters extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelected;
  const CuisineFilters({
    super.key,
    required this.selected,
    required this.onSelected,
  });
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 88 + MediaQuery.textScalerOf(context).scale(11) - 11,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        for (final item in [
          (Icons.restaurant, 'All'),
          (Icons.coffee, 'Coffee'),
          (Icons.ramen_dining, 'Maldivian'),
          (Icons.local_pizza, 'Pizza'),
        ])
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Semantics(
              selected: selected == item.$2,
              button: true,
              child: InkWell(
                onTap: () => onSelected(item.$2),
                borderRadius: BorderRadius.circular(18),
                child: SizedBox(
                  width: 65,
                  child: Column(
                    children: [
                      Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          color: selected == item.$2
                              ? browseYellow.withValues(alpha: .65)
                              : Colors.white.withValues(alpha: .8),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: selected == item.$2
                                ? browseYellow
                                : const Color(0xFFE8E8E4),
                          ),
                        ),
                        child: Icon(item.$1, size: 27, color: browseInk),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        item.$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class FoodCover extends StatelessWidget {
  final String name;
  final String? imageAsset;
  final double height;
  const FoodCover({
    super.key,
    required this.name,
    this.imageAsset,
    this.height = 150,
  });
  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: imageAsset != null
        ? Image.asset(
            imageAsset!,
            fit: BoxFit.cover,
            semanticLabel: 'Sample food photography',
          )
        : Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFE989), Color(0xFFFFF6D3)],
              ),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    name.toLowerCase().contains('pizza')
                        ? Icons.local_pizza_outlined
                        : name.toLowerCase().contains('cafe')
                        ? Icons.coffee_outlined
                        : Icons.ramen_dining,
                    size: 38,
                    color: browseInk,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Photo coming soon',
                    style: TextStyle(fontSize: 10, color: browseMuted),
                  ),
                ],
              ),
            ),
          ),
  );
}

class RestaurantCard extends StatelessWidget {
  final String name, subtitle, detail;
  final String? imageAsset;
  final VoidCallback onTap;
  final bool compact;
  const RestaurantCard({
    super.key,
    required this.name,
    required this.subtitle,
    required this.detail,
    required this.onTap,
    this.imageAsset,
    this.compact = false,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: compact ? 0 : 18),
    child: Material(
      color: Colors.white.withValues(alpha: .6),
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: FoodCover(
                name: name,
                imageAsset: imageAsset,
                height: compact ? 116 : 166,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 11, 12, 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: compact ? 16 : 19,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.4,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: browseMuted),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    detail,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class RestaurantRail extends StatelessWidget {
  final List<Widget> cards;
  const RestaurantRail({super.key, required this.cards});
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 236 + (MediaQuery.textScalerOf(context).scale(14) - 14) * 8,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: cards.length,
      separatorBuilder: (_, _) => const SizedBox(width: 12),
      itemBuilder: (_, index) => SizedBox(width: 225, child: cards[index]),
    ),
  );
}

class CafeFeature extends StatelessWidget {
  final VoidCallback onTap;
  const CafeFeature({super.key, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
    color: browseInk,
    borderRadius: BorderRadius.circular(24),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'YOUR DAILY LITTLE JOY',
                      style: TextStyle(
                        color: browseYellow,
                        fontSize: 9,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Good mornings.\nBetter coffee.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        height: 1.1,
                        letterSpacing: -.6,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Row(
                      children: [
                        Flexible(
                          child: Text(
                            'Explore The Cafe',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        SizedBox(width: 5),
                        Icon(
                          Icons.arrow_forward,
                          color: browseYellow,
                          size: 16,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(
              width: 114,
              child: Image.asset(
                'assets/food/cafe-preview.png',
                fit: BoxFit.cover,
                semanticLabel: 'Sample café photography',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
