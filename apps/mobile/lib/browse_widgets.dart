import 'package:flutter/material.dart';

import 'native_glass_bar.dart';

const _ink = Color(0xFF181918);

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
        left: 18,
        right: 18,
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
    height: 49,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        for (final item in [
          (Icons.restaurant_outlined, 'All'),
          (Icons.coffee_outlined, 'Coffee'),
          (Icons.ramen_dining_outlined, 'Maldivian'),
          (Icons.local_pizza_outlined, 'Pizza'),
        ])
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              avatar: Icon(
                item.$1,
                size: 17,
                color: selected == item.$2 ? Colors.white : _ink,
              ),
              label: Text(item.$2),
              selected: selected == item.$2,
              showCheckmark: false,
              selectedColor: _ink,
              backgroundColor: Colors.white.withValues(alpha: .7),
              labelStyle: TextStyle(
                color: selected == item.$2 ? Colors.white : _ink,
                fontWeight: FontWeight.w600,
              ),
              side: BorderSide(color: Colors.white.withValues(alpha: .8)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
              onSelected: (_) => onSelected(item.$2),
            ),
          ),
      ],
    ),
  );
}

/// Sample photography is used only in preview; real catalogue entries display
/// an honest placeholder until restaurants supply their own images.
class RestaurantCard extends StatelessWidget {
  final String name, subtitle, detail;
  final String? imageAsset;
  final VoidCallback onTap;
  const RestaurantCard({
    super.key,
    required this.name,
    required this.subtitle,
    required this.detail,
    required this.onTap,
    this.imageAsset,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Material(
      color: Colors.white.withValues(alpha: .72),
      borderRadius: BorderRadius.circular(26),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 160,
              child: imageAsset != null
                  ? Image.asset(
                      imageAsset!,
                      fit: BoxFit.cover,
                      semanticLabel: 'Sample café food photography',
                    )
                  : Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0xFFFFF2AF), Color(0xFFF4F0E3)],
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.restaurant_outlined,
                            size: 42,
                            color: _ink,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            name,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const Text(
                            'Photo coming soon',
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF72756F),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.4,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF72756F),
                          ),
                        ),
                        const SizedBox(height: 9),
                        Row(
                          children: [
                            const Icon(Icons.schedule, size: 14),
                            const SizedBox(width: 5),
                            Expanded(
                              child: Text(
                                detail,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_outward, size: 20),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class CafeFeature extends StatelessWidget {
  final VoidCallback onTap;
  const CafeFeature({super.key, required this.onTap});
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(28),
    child: ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 220),
      child: Stack(
        children: [
          Positioned.fill(
            child: Image.asset(
              'assets/food/cafe-preview.png',
              fit: BoxFit.cover,
              alignment: Alignment.centerRight,
            ),
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFFFE969), Color(0x00FFE969)],
                  stops: [0, .74],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'A LITTLE MOMENT, DELIVERED',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.1,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Your coffee.\nYour kind of day.',
                  style: TextStyle(
                    fontSize: 26,
                    height: 1.1,
                    letterSpacing: -.8,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 22),
                TextButton(
                  onPressed: onTap,
                  style: TextButton.styleFrom(
                    backgroundColor: _ink,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 12,
                    ),
                  ),
                  child: const Text('Explore The Cafe  →'),
                ),
                const SizedBox(height: 5),
                const Text(
                  'Sample restaurant · design preview',
                  style: TextStyle(fontSize: 9),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
