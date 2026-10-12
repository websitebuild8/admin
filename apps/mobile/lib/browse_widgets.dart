import 'package:flutter/cupertino.dart';
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
  final int? transitionKey;
  const FloatingWorkspace({
    super.key,
    required this.header,
    required this.body,
    required this.labels,
    required this.selected,
    required this.onSelected,
    this.transitionKey,
  });
  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Column(
        children: [
          header,
          Expanded(
            child: transitionKey == null
                ? body
                : AnimatedSwitcher(
                    duration: MediaQuery.disableAnimationsOf(context)
                        ? Duration.zero
                        : const Duration(milliseconds: 220),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: KeyedSubtree(
                      key: ValueKey(transitionKey),
                      child: body,
                    ),
                  ),
          ),
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
    padding: const EdgeInsets.only(top: 24, bottom: 16),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 19,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.5,
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
  final VoidCallback? onAccount;
  const DeliveryAddressHeader({
    super.key,
    required this.address,
    required this.area,
    required this.onTap,
    this.onAccount,
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
                  'DELIVER TO',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w800,
                    color: browseMuted,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(
                      CupertinoIcons.location_solid,
                      size: 17,
                      color: browseInk,
                    ),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -.4,
                        ),
                      ),
                    ),
                    const Icon(Icons.expand_more, size: 19),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  area,
                  style: const TextStyle(fontSize: 11, color: browseMuted),
                ),
              ],
            ),
          ),
        ),
      ),
      if (onAccount != null)
        IconButton.filledTonal(
          tooltip: 'Your account',
          onPressed: onAccount,
          style: IconButton.styleFrom(
            backgroundColor: browseInk,
            foregroundColor: Colors.white,
            minimumSize: const Size(44, 44),
          ),
          icon: const Icon(CupertinoIcons.person_fill, size: 21),
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
    height: 96 + MediaQuery.textScalerOf(context).scale(12) - 12,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        for (final item in [
          (CupertinoIcons.square_grid_2x2, 'All'),
          (Icons.coffee_rounded, 'Coffee'),
          (Icons.ramen_dining_rounded, 'Maldivian'),
          (Icons.local_pizza_rounded, 'Pizza'),
        ])
          Padding(
            padding: const EdgeInsets.only(right: 18),
            child: Semantics(
              selected: selected == item.$2,
              button: true,
              child: InkWell(
                onTap: () => onSelected(item.$2),
                borderRadius: BorderRadius.circular(18),
                child: SizedBox(
                  width: 68,
                  child: Column(
                    children: [
                      AnimatedContainer(
                        duration: MediaQuery.disableAnimationsOf(context)
                            ? Duration.zero
                            : const Duration(milliseconds: 180),
                        width: 66,
                        height: 66,
                        decoration: BoxDecoration(
                          color: selected == item.$2
                              ? browseYellow.withValues(alpha: .55)
                              : const Color(0xFFF6F3E9),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: selected == item.$2
                                ? browseYellow
                                : const Color(0xFFE8E8E4),
                          ),
                        ),
                        child: Icon(item.$1, size: 29, color: browseInk),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        item.$2,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
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
  Widget build(BuildContext context) {
    final cover = ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: FoodCover(
        name: name,
        imageAsset: imageAsset,
        height: compact ? 120 : 110,
      ),
    );
    final information = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          name,
          maxLines: compact ? 1 : 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: compact ? 15 : 17,
            fontWeight: FontWeight.w800,
            letterSpacing: -.4,
          ),
        ),
        const SizedBox(height: 5),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(CupertinoIcons.time, size: 13),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                detail,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.3,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 11,
            height: 1.35,
            color: browseMuted,
          ),
        ),
      ],
    );
    return Padding(
      padding: EdgeInsets.only(bottom: compact ? 0 : 16),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: compact
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    cover,
                    Padding(
                      padding: const EdgeInsets.fromLTRB(2, 10, 2, 0),
                      child: information,
                    ),
                  ],
                )
              : Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      SizedBox(width: 110, child: cover),
                      const SizedBox(width: 16),
                      Expanded(child: information),
                      const SizedBox(width: 5),
                      const Icon(
                        CupertinoIcons.chevron_right,
                        size: 13,
                        color: browseMuted,
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

class RestaurantRail extends StatelessWidget {
  final List<Widget> cards;
  const RestaurantRail({super.key, required this.cards});
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 230 + (MediaQuery.textScalerOf(context).scale(14) - 14) * 8,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: cards.length,
      separatorBuilder: (_, _) => const SizedBox(width: 12),
      itemBuilder: (_, index) => SizedBox(width: 162, child: cards[index]),
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
