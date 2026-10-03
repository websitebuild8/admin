import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models.dart';

const yellow = Color(0xFFFFDF35);
const ink = Color(0xFF181918);
const muted = Color(0xFF72756F);
const previewEnabled = bool.fromEnvironment('IGO_PREVIEW', defaultValue: false);
void main() => runApp(const IgoApp());

class IgoApp extends StatelessWidget {
  final bool preview;
  const IgoApp({super.key, this.preview = previewEnabled});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'iGO',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFFF8F8F2),
      colorScheme: ColorScheme.fromSeed(
        seedColor: yellow,
        primary: ink,
        secondary: yellow,
        surface: Colors.white,
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 36,
          fontWeight: FontWeight.w800,
          letterSpacing: -1.4,
          color: ink,
        ),
        headlineMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          letterSpacing: -.8,
          color: ink,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
        bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: ink),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: yellow,
          foregroundColor: ink,
          minimumSize: const Size(double.infinity, 54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: .8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
      ),
    ),
    home: Welcome(preview: preview),
  );
}

class Glass extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const Glass({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
  });
  @override
  Widget build(BuildContext context) {
    final reduced =
        MediaQuery.of(context).disableAnimations ||
        MediaQuery.of(context).highContrast;
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: reduced ? 0 : 16,
          sigmaY: reduced ? 0 : 16,
        ),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: reduced ? 1 : .78),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: Colors.white.withValues(alpha: .95)),
          ),
          child: Material(type: MaterialType.transparency, child: child),
        ),
      ),
    );
  }
}

class CanvasPage extends StatelessWidget {
  final Widget child;
  const CanvasPage({super.key, required this.child});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFF6BC), Color(0xFFF8F8F2), Color(0xFFF0F3EE)],
        ),
      ),
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Material(type: MaterialType.transparency, child: child),
          ),
        ),
      ),
    ),
  );
}

class Welcome extends StatelessWidget {
  final bool preview;
  const Welcome({super.key, required this.preview});
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: ListView(
      padding: const EdgeInsets.all(28),
      children: [
        const SizedBox(height: 24),
        Row(
          children: [
            const Text(
              'MALÉ + HULHUMALÉ',
              style: TextStyle(
                letterSpacing: 2,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            const Icon(Icons.north_east, size: 20),
          ],
        ),
        const SizedBox(height: 38),
        ClipRRect(
          borderRadius: BorderRadius.circular(42),
          child: Image.asset(
            'assets/brand/igo-logo.jpg',
            height: 230,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(height: 34),
        Text(
          'Your favourites.\nAt your doorstep.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 12),
        const Text(
          'Coffee mornings. Comfort food. Everyday essentials. A little less waiting, a little more living.',
          style: TextStyle(color: muted, fontSize: 16, height: 1.6),
        ),
        const SizedBox(height: 24),
        Glass(
          child: Row(
            children: [
              const Icon(Icons.delivery_dining, size: 32),
              const SizedBox(width: 14),
              const Expanded(
                child: Text(
                  'You order. I go.\nMade for your islands.',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => RoleEntry(preview: preview)),
          ),
          child: Text(preview ? 'Explore the app preview' : 'Get started'),
        ),
        const SizedBox(height: 16),
        Text(
          preview
              ? 'DESIGN PREVIEW · FICTIONAL DATA'
              : 'One app. Your everyday, delivered.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11, color: muted, letterSpacing: 1),
        ),
      ],
    ),
  );
}

class RoleEntry extends StatelessWidget {
  final bool preview;
  const RoleEntry({super.key, required this.preview});
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          preview ? 'A little iGO for\neveryone.' : 'Welcome to iGO.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 12),
        Text(
          preview
              ? 'Choose an experience to preview. These are sample roles, not account permissions.'
              : 'Mobile registration is being connected. Restaurant and rider access will require approval.',
          style: const TextStyle(color: muted),
        ),
        const SizedBox(height: 28),
        for (final role in AppRole.values)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Glass(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  [
                    Icons.shopping_bag_outlined,
                    Icons.storefront,
                    Icons.delivery_dining,
                  ][role.index],
                  size: 32,
                ),
                title: Text(
                  [
                    'Order something good',
                    'My restaurant',
                    'Deliver with iGO',
                  ][role.index],
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  [
                    'Discover food & coffee',
                    'Manage your kitchen and orders',
                    'Pick up, navigate, deliver',
                  ][role.index],
                ),
                trailing: const Icon(Icons.arrow_forward),
                onTap: () {
                  if (preview) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => Workspace(role: role)),
                    );
                  } else {
                    showDialog(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Registration coming next'),
                        content: const Text(
                          'Clerk mobile authentication and approval are not connected yet. No account has been created.',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Got it'),
                          ),
                        ],
                      ),
                    );
                  }
                },
              ),
            ),
          ),
      ],
    ),
  );
}

class Workspace extends StatefulWidget {
  final AppRole role;
  const Workspace({super.key, required this.role});
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  int tab = 0;
  int preparation = 0;
  int delivery = 0;
  bool online = true;
  String area = 'Malé';
  String query = '';
  final cart = Cart();
  void toast(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  void menuPage() => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => MenuPage(cart: cart)),
  );
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
          child: Row(
            children: [
              const Text(
                'PREVIEW',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Change experience'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 10, 24, 24),
            children: tab == 2
                ? profile()
                : widget.role == AppRole.customer
                ? (tab == 0 ? customer() : customerOrders())
                : widget.role == AppRole.restaurant
                ? restaurant()
                : rider(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
          child: Glass(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: [
                for (int i = 0; i < 3; i++)
                  Expanded(
                    child: Semantics(
                      selected: tab == i,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(22),
                        onTap: () => setState(() => tab = i),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: tab == i ? yellow : Colors.transparent,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                [
                                  Icons.home_outlined,
                                  Icons.receipt_long_outlined,
                                  Icons.person_outline,
                                ][i],
                              ),
                              const SizedBox(height: 3),
                              Text(
                                ['Home', 'Orders', 'Account'][i],
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
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
          ),
        ),
      ],
    ),
  );
  List<Widget> customer() => [
    Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'DELIVER TO',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: muted,
                ),
              ),
              TextButton.icon(
                onPressed: address,
                icon: const Icon(Icons.location_on_outlined, size: 18),
                label: Text('Home · $area  ⌄'),
              ),
            ],
          ),
        ),
        const CircleAvatar(
          backgroundColor: Colors.white,
          child: Icon(Icons.notifications_none),
        ),
      ],
    ),
    const SizedBox(height: 16),
    Text(
      'What sounds\ngood today?',
      style: Theme.of(context).textTheme.headlineLarge,
    ),
    const SizedBox(height: 20),
    TextField(
      onChanged: (v) => setState(() => query = v),
      decoration: const InputDecoration(
        hintText: 'Search restaurants or food',
        prefixIcon: Icon(Icons.search),
      ),
    ),
    const SizedBox(height: 20),
    Row(
      children: [
        for (final item in [
          ('🍔', 'Food'),
          ('☕', 'Coffee'),
          ('🛍️', 'Shops'),
          ('📦', 'Anything'),
        ])
          Expanded(
            child: InkWell(
              onTap: () {
                if (item.$2 == 'Coffee' || item.$2 == 'Food') {
                  setState(() => query = item.$2 == 'Coffee' ? 'Cafe' : '');
                } else {
                  toast('More categories are coming soon.');
                }
              },
              child: Column(
                children: [
                  Text(item.$1, style: const TextStyle(fontSize: 30)),
                  const SizedBox(height: 8),
                  Text(item.$2, style: const TextStyle(fontSize: 12)),
                ],
              ),
            ),
          ),
      ],
    ),
    const SizedBox(height: 24),
    Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: yellow,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'YOUR DAILY LITTLE TREAT',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Good coffee.\nGreat day.',
                  style: TextStyle(
                    fontSize: 27,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: menuPage,
                  style: TextButton.styleFrom(
                    backgroundColor: ink,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Find your favourite  →'),
                ),
              ],
            ),
          ),
          const Text('☕', style: TextStyle(fontSize: 70)),
        ],
      ),
    ),
    const SizedBox(height: 28),
    Text('Popular near you', style: Theme.of(context).textTheme.titleLarge),
    const SizedBox(height: 14),
    for (final shop in [
      ('The Cafe', 'Coffee • Snacks', '☕', '25–35'),
      ('Island Bites', 'Maldivian • Local favourites', '🍛', '30–40'),
      ('Pizza Wave', 'Pizza • Italian', '🍕', '25–40'),
    ])
      if ('${shop.$1} ${shop.$2}'.toLowerCase().contains(query.toLowerCase()))
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Glass(
            child: InkWell(
              onTap: shop.$1 == 'The Cafe'
                  ? menuPage
                  : () => toast('This sample menu is coming next.'),
              child: Row(
                children: [
                  Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF4EBD8),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Center(
                      child: Text(
                        shop.$3,
                        style: const TextStyle(fontSize: 42),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          shop.$1,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 17,
                          ),
                        ),
                        Text(
                          shop.$2,
                          style: const TextStyle(color: muted, fontSize: 12),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '★ 4.8   •   ${shop.$4} min',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
        ),
  ];
  void address() async {
    final result = await Navigator.push<PreviewAddress>(
      context,
      MaterialPageRoute(builder: (_) => AddressPage(area: area)),
    );
    if (result != null && mounted) setState(() => area = result.area);
  }

  List<Widget> customerOrders() => [
    Text('Your orders', style: Theme.of(context).textTheme.headlineLarge),
    const SizedBox(height: 20),
    const Glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'The Cafe · SAMPLE-001',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          SizedBox(height: 8),
          Text('Iced latte + Chocolate cake'),
          SizedBox(height: 18),
          Text(
            'Restaurant confirmed',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          Text('Rider assigned → Rider arrived → On the way'),
          SizedBox(height: 16),
          Text(
            'Estimated arrival: 25–35 minutes',
            style: TextStyle(color: muted),
          ),
          Text('Sample estimate, not a live delivery.'),
        ],
      ),
    ),
    const SizedBox(height: 16),
    OutlinedButton(
      onPressed: () => toast('Support will be connected before launch.'),
      child: const Text('Get help with an order'),
    ),
  ];
  List<Widget> restaurant() => [
    Text('Hello, The Cafe.', style: Theme.of(context).textTheme.headlineMedium),
    const Text(
      'A good day starts in your kitchen.',
      style: TextStyle(color: muted),
    ),
    const SizedBox(height: 24),
    Glass(
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Accepting orders',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          Switch(value: online, onChanged: (v) => setState(() => online = v)),
        ],
      ),
    ),
    const SizedBox(height: 24),
    Text('Kitchen orders', style: Theme.of(context).textTheme.titleLarge),
    const SizedBox(height: 14),
    Glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SAMPLE-001',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text('1 × Iced latte\n1 × Chocolate cake'),
          const Divider(height: 32),
          const Text(
            'MVR 105 · Sample paid order',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Text(
            [
              'Awaiting confirmation',
              'Order confirmed',
              'Ready for pickup',
              'Order picked up',
            ][preparation],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: preparation < 3
                ? () => setState(() => preparation++)
                : null,
            child: Text(
              [
                'Confirm order',
                'Ready for pickup',
                'Confirm handover',
                'Picked up',
              ][preparation],
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Preview updates stay on this device.',
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ],
      ),
    ),
    const SizedBox(height: 18),
    OutlinedButton.icon(
      onPressed: address,
      icon: const Icon(Icons.location_on_outlined),
      label: const Text('Set pickup address'),
    ),
  ];
  List<Widget> rider() => [
    Text(
      'Let’s get moving.',
      style: Theme.of(context).textTheme.headlineMedium,
    ),
    const Text(
      'Your next delivery is around the corner.',
      style: TextStyle(color: muted),
    ),
    const SizedBox(height: 20),
    Glass(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  online ? 'You’re available' : 'You’re offline',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                DropdownButton<String>(
                  value: area,
                  underline: const SizedBox(),
                  items: ['Malé', 'Hulhumalé']
                      .map((a) => DropdownMenuItem(value: a, child: Text(a)))
                      .toList(),
                  onChanged: (v) => setState(() => area = v!),
                ),
              ],
            ),
          ),
          Switch(value: online, onChanged: (v) => setState(() => online = v)),
        ],
      ),
    ),
    const SizedBox(height: 24),
    Text(
      delivery == 0 ? 'Available in $area' : 'Your delivery',
      style: Theme.of(context).textTheme.titleLarge,
    ),
    const SizedBox(height: 14),
    if (area == 'Malé' || delivery > 0)
      Glass(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'SAMPLE-001 · 2 items',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 18),
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.storefront),
              title: Text('The Cafe'),
              subtitle: Text('Malé · sample pickup entrance'),
            ),
            if (delivery > 0) ...[
              OutlinedButton.icon(
                onPressed: () => navigate(4.1755, 73.5093),
                icon: const Icon(Icons.near_me_outlined),
                label: const Text('Navigate to restaurant'),
              ),
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.home_outlined),
                title: Text('Customer delivery'),
                subtitle: Text('Sample destination · Malé'),
              ),
              OutlinedButton.icon(
                onPressed: () => navigate(4.172, 73.515),
                icon: const Icon(Icons.near_me_outlined),
                label: const Text('Navigate to customer'),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: delivery < 5 && (online || delivery > 0)
                  ? () => setState(() => delivery++)
                  : null,
              child: Text(
                [
                  'Accept sample delivery',
                  'Arrived at restaurant',
                  'Order picked up',
                  'Arrived at customer',
                  'Complete delivery',
                  'Delivery complete',
                ][delivery],
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Directions open in Google Maps. iGO does not collect your live location.',
              style: TextStyle(color: muted, fontSize: 12),
            ),
          ],
        ),
      )
    else
      const Glass(
        child: Text(
          'No sample jobs in this area. Choose Malé to explore a delivery.',
        ),
      ),
  ];
  Future<void> navigate(double lat, double lng) async {
    try {
      if (!await launchUrl(
        directions(lat, lng),
        mode: LaunchMode.externalApplication,
      )) {
        toast('Could not open Maps. Try again.');
      }
    } catch (_) {
      if (mounted) toast('Could not open Maps. Try again.');
    }
  }

  List<Widget> profile() => [
    Text('Your corner.', style: Theme.of(context).textTheme.headlineLarge),
    const SizedBox(height: 24),
    Glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${widget.role.name.toUpperCase()} PREVIEW',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          const Text(
            'Fictional account. Nothing here changes your real account, money, or orders.',
          ),
        ],
      ),
    ),
    const SizedBox(height: 16),
    ListTile(
      leading: const Icon(Icons.location_on_outlined),
      title: const Text('Saved address'),
      trailing: const Icon(Icons.chevron_right),
      onTap: address,
    ),
    ListTile(
      leading: const Icon(Icons.policy_outlined),
      title: const Text('Privacy & order policies'),
      onTap: () => showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Before we launch'),
          content: const Text(
            'Business details and legal policies are still being finalized. Card payments will use BML hosted checkout. Location is used for saved addresses, not continuous tracking.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    ),
    ListTile(
      leading: const Icon(Icons.logout),
      title: const Text('Leave preview'),
      onTap: () => Navigator.pop(context),
    ),
  ];
}

class MenuPage extends StatefulWidget {
  final Cart cart;
  const MenuPage({super.key, required this.cart});
  @override
  State<MenuPage> createState() => _MenuPageState();
}

class _MenuPageState extends State<MenuPage> {
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back),
                ),
              ),
              Container(
                height: 170,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFD9C4A0), Color(0xFFF4E7D0)],
                  ),
                  borderRadius: BorderRadius.circular(30),
                ),
                child: const Center(
                  child: Text('☕', style: TextStyle(fontSize: 100)),
                ),
              ),
              const SizedBox(height: 22),
              Text(
                'The Cafe',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const Text(
                '★ 4.8  ·  Coffee, snacks & little joys',
                style: TextStyle(color: muted),
              ),
              const SizedBox(height: 12),
              const Text('25–35 min  •  Delivery MVR 25  •  Sample menu'),
              const SizedBox(height: 24),
              Text(
                'Made for your mood',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              for (int i = 0; i < menu.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Glass(
                    child: Row(
                      children: [
                        Text(
                          menu[i].emoji,
                          style: const TextStyle(fontSize: 40),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                menu[i].name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                menu[i].description,
                                style: const TextStyle(
                                  color: muted,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                money(menu[i].price),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton.filledTonal(
                          tooltip: 'Add ${menu[i].name}',
                          onPressed: () =>
                              setState(() => widget.cart.change(i, 1)),
                          icon: const Icon(Icons.add),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: FilledButton(
            onPressed: widget.cart.count == 0
                ? null
                : () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => Checkout(cart: widget.cart),
                      ),
                    );
                    setState(() {});
                  },
            child: Text(
              'View cart · ${widget.cart.count} items · ${money(widget.cart.subtotal)}',
            ),
          ),
        ),
      ],
    ),
  );
}

class Checkout extends StatefulWidget {
  final Cart cart;
  const Checkout({super.key, required this.cart});
  @override
  State<Checkout> createState() => _CheckoutState();
}

class _CheckoutState extends State<Checkout> {
  bool agreed = false;
  PreviewAddress? address;
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        Text('Your cart', style: Theme.of(context).textTheme.headlineLarge),
        const Text(
          'A little something from The Cafe.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 24),
        for (final e in widget.cart.quantities.entries.toList())
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Text(
              menu[e.key].emoji,
              style: const TextStyle(fontSize: 28),
            ),
            title: Text(menu[e.key].name),
            subtitle: Text(money(menu[e.key].price * e.value)),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Remove one ${menu[e.key].name}',
                  onPressed: () =>
                      setState(() => widget.cart.change(e.key, -1)),
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('${e.value}'),
                IconButton(
                  tooltip: 'Add one ${menu[e.key].name}',
                  onPressed: () => setState(() => widget.cart.change(e.key, 1)),
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
          ),
        if (widget.cart.count == 0) const Text('Your cart is empty.'),
        const SizedBox(height: 16),
        Glass(
          child: ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.location_on_outlined),
            title: const Text('Delivery address'),
            subtitle: Text(
              address?.label ?? 'Choose your building and entrance',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              final v = await Navigator.push<PreviewAddress>(
                context,
                MaterialPageRoute(
                  builder: (_) => const AddressPage(area: 'Malé'),
                ),
              );
              if (v != null && mounted) setState(() => address = v);
            },
          ),
        ),
        const SizedBox(height: 18),
        const TextField(
          maxLines: 2,
          decoration: InputDecoration(
            hintText: 'Anything the kitchen should know?',
          ),
        ),
        const SizedBox(height: 24),
        const ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.credit_card),
          title: Text('Card via BML'),
          subtitle: Text('Secure bank-hosted checkout · coming next'),
        ),
        const Divider(),
        priceRow('Subtotal', widget.cart.subtotal),
        priceRow('Delivery', widget.cart.deliveryFee),
        priceRow('Preview total', widget.cart.total),
        const Text(
          'Illustrative pricing. Final fees and applicable taxes will come from a server quote.',
          style: TextStyle(fontSize: 12, color: muted),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: agreed,
          onChanged: (v) => setState(() => agreed = v!),
          title: const Text(
            'I understand that confirmed paid orders cannot be cancelled for a change of mind. Support for order problems remains available.',
            style: TextStyle(fontSize: 12),
          ),
        ),
        const FilledButton(
          onPressed: null,
          child: Text('Payments not connected yet'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Preview only. No payment is taken and no order is submitted.',
          textAlign: TextAlign.center,
          style: TextStyle(color: muted, fontSize: 12),
        ),
      ],
    ),
  );
  Widget priceRow(String label, int amount) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          money(amount),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class AddressPage extends StatefulWidget {
  final String area;
  const AddressPage({super.key, required this.area});
  @override
  State<AddressPage> createState() => _AddressPageState();
}

class _AddressPageState extends State<AddressPage> {
  final form = GlobalKey<FormState>();
  final building = TextEditingController();
  final unit = TextEditingController();
  final instructions = TextEditingController();
  late String area = widget.area;
  @override
  void dispose() {
    building.dispose();
    unit.dispose();
    instructions.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => CanvasPage(
    child: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
            ),
          ),
          Text(
            'Right to your\ndoorstep.',
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          const SizedBox(height: 16),
          const Glass(
            child: Column(
              children: [
                Icon(Icons.location_on_outlined, size: 44),
                SizedBox(height: 12),
                Text('Entrance pin selection is coming next.'),
                Text(
                  'No location permission or live tracking is used in this preview.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          DropdownButtonFormField<String>(
            initialValue: area,
            decoration: const InputDecoration(labelText: 'Island'),
            items: [
              'Malé',
              'Hulhumalé',
            ].map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(),
            onChanged: (v) => setState(() => area = v!),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: building,
            decoration: const InputDecoration(
              labelText: 'Building / house name',
            ),
            validator: (v) => v == null || v.trim().isEmpty
                ? 'Enter your building name'
                : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: unit,
            decoration: const InputDecoration(
              labelText: 'Apartment, floor, or pickup counter',
            ),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: instructions,
            decoration: const InputDecoration(
              labelText: 'Entrance instructions',
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () {
              if (form.currentState!.validate()) {
                Navigator.pop(
                  context,
                  PreviewAddress(
                    area,
                    building.text.trim(),
                    unit.text.trim(),
                    instructions.text.trim(),
                  ),
                );
              }
            },
            child: const Text('Use preview address'),
          ),
        ],
      ),
    ),
  );
}
