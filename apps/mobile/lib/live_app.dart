import 'dart:async';

import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'main.dart' show CanvasPage, Glass, AddressPage, muted;
import 'models.dart';
import 'mobile_api.dart';
import 'browse_widgets.dart';
import 'delivery_widgets.dart';
import 'places_lookup.dart';
import 'entrance_map.dart';
import 'demo_app.dart';

const apiBase = String.fromEnvironment('IGO_API_BASE_URL');

class LiveGate extends StatelessWidget {
  const LiveGate({super.key});
  @override
  Widget build(BuildContext context) => ClerkAuthBuilder(
    signedOutBuilder: (context, auth) => CanvasPage(
      child: ClerkErrorListener(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const SizedBox(height: 24),
            Align(
              alignment: Alignment.centerLeft,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Image.asset(
                  'assets/brand/igo-logo.jpg',
                  width: 68,
                  height: 68,
                ),
              ),
            ),
            const SizedBox(height: 28),
            const WorkspaceHeading(
              eyebrow: 'You order. I go.',
              title: 'Good to see you.',
            ),
            const Text('Sign in or create your account to continue.'),
            const SizedBox(height: 24),
            const ClerkAuthentication(),
            TextButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DemoJoinPage()),
              ),
              icon: const Icon(Icons.science_outlined),
              label: const Text('Try shared demo'),
            ),
          ],
        ),
      ),
    ),
    signedInBuilder: (context, auth) =>
        LiveAccountGate(key: ValueKey(auth.user?.id), auth: auth),
  );
}

class LiveAccountGate extends StatefulWidget {
  final ClerkAuthState auth;
  const LiveAccountGate({super.key, required this.auth});
  @override
  State<LiveAccountGate> createState() => _LiveAccountGateState();
}

class _LiveAccountGateState extends State<LiveAccountGate>
    with WidgetsBindingObserver {
  late final MobileApi api;
  Map<String, dynamic>? account;
  String? error;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    api = MobileApi(
      baseUrl: apiBase,
      token: () async => (await widget.auth.sessionToken()).jwt,
    );
    refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    api.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }

  Future<void> refresh() async {
    try {
      final data = await api.request('account');
      if (mounted) {
        setState(() {
          account = data;
          error = null;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const CanvasPage(
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (error != null) {
      return CanvasPage(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error!),
              FilledButton(onPressed: refresh, child: const Text('Try again')),
              TextButton(
                onPressed: widget.auth.signOut,
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      );
    }
    final a = account!;
    if (a['registered'] != true) {
      return RegistrationPage(
        api: api,
        account: a,
        refresh: refresh,
        signOut: widget.auth.signOut,
      );
    }
    if (a['access'] == null) {
      return CanvasPage(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 50),
            const Icon(Icons.verified_user_outlined, size: 64),
            const SizedBox(height: 24),
            Text(
              a['status'] == 'Pending'
                  ? 'We’re reviewing\nyour application.'
                  : 'Your access is ${a['status']?.toString().toLowerCase() ?? 'unavailable'}.',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            const Text(
              'Restaurant and rider access opens after the iGO team verifies and approves the application.',
            ),
            if (a['role'] == 'restaurant')
              TextButton(
                onPressed: () =>
                    editAddress(context, api, a, pickup: true, after: refresh),
                child: const Text('Update pickup entrance'),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: refresh,
              child: const Text('Check application status'),
            ),
            TextButton(
              onPressed: widget.auth.signOut,
              child: const Text('Sign out'),
            ),
          ],
        ),
      );
    }
    if ((a['policy'] as Map)['accepted'] != true) {
      return CanvasPage(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Review our updated policies',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            PolicyLinks(api: api),
            FilledButton(
              onPressed: () async {
                try {
                  await api.request(
                    'policies',
                    data: {'version': a['policy']['version'], 'accepted': true},
                  );
                  await refresh();
                } catch (e) {
                  if (context.mounted) message(context, e.toString());
                }
              },
              child: const Text('I have reviewed and accept the policies'),
            ),
            TextButton(
              onPressed: widget.auth.signOut,
              child: const Text('Sign out'),
            ),
          ],
        ),
      );
    }
    return LiveWorkspace(
      api: api,
      account: a,
      refreshAccount: refresh,
      signOut: widget.auth.signOut,
    );
  }
}

void message(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
Future<void> openLink(BuildContext context, Uri uri) async {
  try {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) message(context, 'Could not open this link.');
    }
  } catch (_) {
    if (context.mounted) message(context, 'Could not open this link.');
  }
}

class PolicyLinks extends StatelessWidget {
  final MobileApi api;
  const PolicyLinks({super.key, required this.api});
  @override
  Widget build(BuildContext context) => api.isDemo
      ? const Text(
          'Fictional demo only. No purchase agreement, real payment or delivery.',
          style: TextStyle(color: muted, fontSize: 12),
        )
      : Wrap(
          children: [
            for (final p in {
              'terms': 'Terms',
              'privacy': 'Privacy',
              'refunds': 'Order problems',
              'partners': 'Partner terms',
            }.entries)
              TextButton(
                onPressed: () =>
                    openLink(context, api.base.resolve('/legal/${p.key}')),
                child: Text(p.value),
              ),
          ],
        );
}

class RegistrationPage extends StatefulWidget {
  final MobileApi api;
  final Map<String, dynamic> account;
  final Future<void> Function() refresh;
  final Future<void> Function() signOut;
  const RegistrationPage({
    super.key,
    required this.api,
    required this.account,
    required this.refresh,
    required this.signOut,
  });
  @override
  State<RegistrationPage> createState() => _RegistrationPageState();
}

class _RegistrationPageState extends State<RegistrationPage> {
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      phone = TextEditingController(text: '+960'),
      business = TextEditingController(),
      cuisine = TextEditingController();
  String role = 'customer', area = 'Malé', vehicle = 'Motorbike';
  PreviewAddress? pickup;
  bool accepted = false, busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in [name, phone, business, cuisine]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    if (!accepted || (role == 'restaurant' && pickup == null)) {
      setState(
        () => error = !accepted
            ? 'Review and accept the policies first.'
            : 'Choose your pickup entrance.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.request(
        'register',
        data: {
          'role': role,
          'name': name.text.trim(),
          'phone': phone.text.trim(),
          'area': area,
          'policyVersion': widget.account['policy']['version'],
          'acceptedPolicies': true,
          if (role == 'restaurant') 'businessName': business.text.trim(),
          if (role == 'restaurant') 'cuisine': cuisine.text.trim(),
          if (role == 'restaurant') 'pickup': pickup!.toJson(),
          if (role == 'rider') 'vehicle': vehicle,
        },
      );
      await widget.refresh();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => CanvasPage(
    child: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            'Make it yours.',
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          const SizedBox(height: 12),
          const Text(
            'One account, one experience. Restaurant and rider applications require approval.',
          ),
          const SizedBox(height: 20),
          Glass(
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: role,
                  decoration: const InputDecoration(
                    labelText: 'I’m joining as',
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: 'customer',
                      child: Text('Customer'),
                    ),
                    DropdownMenuItem(
                      value: 'restaurant',
                      child: Text('Restaurant'),
                    ),
                    DropdownMenuItem(value: 'rider', child: Text('Rider')),
                  ],
                  onChanged: busy ? null : (v) => setState(() => role = v!),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: name,
                  maxLength: 100,
                  decoration: const InputDecoration(
                    labelText: 'Your full name',
                  ),
                  validator: (v) =>
                      (v?.trim().length ?? 0) < 2 ? 'Enter your name.' : null,
                ),
                TextFormField(
                  controller: phone,
                  maxLength: 11,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone number'),
                  validator: (v) =>
                      RegExp(r'^\+960[379]\d{6}$').hasMatch(v ?? '')
                      ? null
                      : 'Use +960 and your seven-digit number.',
                ),
                DropdownButtonFormField<String>(
                  initialValue: area,
                  decoration: const InputDecoration(labelText: 'Service area'),
                  items: ServiceArea.values
                      .map(
                        (a) => DropdownMenuItem(
                          value: a.name,
                          child: Text(a.name),
                        ),
                      )
                      .toList(),
                  onChanged: busy
                      ? null
                      : (v) => setState(() {
                          area = v!;
                          pickup = null;
                        }),
                ),
                if (role == 'restaurant') ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: business,
                    maxLength: 100,
                    decoration: const InputDecoration(
                      labelText: 'Restaurant name',
                    ),
                    validator: (v) =>
                        role == 'restaurant' && (v?.trim().length ?? 0) < 2
                        ? 'Enter the restaurant name.'
                        : null,
                  ),
                  TextFormField(
                    controller: cuisine,
                    maxLength: 100,
                    decoration: const InputDecoration(labelText: 'Cuisine'),
                  ),
                  TextButton.icon(
                    onPressed: busy
                        ? null
                        : () async {
                            final result = await Navigator.push<PreviewAddress>(
                              context,
                              MaterialPageRoute(
                                builder: (_) => AddressPage(
                                  places: MobilePlacesLookup(widget.api),
                                  area: area,
                                  initial: pickup,
                                  pickup: true,
                                ),
                              ),
                            );
                            if (result != null && mounted) {
                              setState(() {
                                pickup = result;
                                area = result.area;
                              });
                            }
                          },
                    icon: const Icon(Icons.pin_drop_outlined),
                    label: Text(pickup?.label ?? 'Choose pickup entrance'),
                  ),
                ],
                if (role == 'rider')
                  DropdownButtonFormField<String>(
                    initialValue: vehicle,
                    decoration: const InputDecoration(labelText: 'Vehicle'),
                    items: ['Motorbike', 'Bicycle', 'Car']
                        .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                        .toList(),
                    onChanged: busy
                        ? null
                        : (v) => setState(() => vehicle = v!),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (widget.account['policy']['published'] != true)
            const Text(
              'Pilot registration · policies contain business placeholders. Payments are disabled.',
              style: TextStyle(color: muted),
            ),
          PolicyLinks(api: widget.api),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: accepted,
            onChanged: busy
                ? null
                : (v) => setState(() => accepted = v ?? false),
            title: const Text(
              'I have reviewed and accept the terms and privacy notice.',
            ),
            subtitle: role == 'customer'
                ? null
                : const Text('Including the partner terms.'),
          ),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          FilledButton(
            onPressed: busy ? null : submit,
            child: Text(
              busy
                  ? 'Saving…'
                  : role == 'customer'
                  ? 'Create my account'
                  : 'Submit application',
            ),
          ),
          TextButton(
            onPressed: busy ? null : widget.signOut,
            child: const Text('Sign out'),
          ),
        ],
      ),
    ),
  );
}

PreviewAddress? storedAddress(Map<String, dynamic>? v) {
  if (v == null) return null;
  try {
    return PreviewAddress(
      google: v['google'] == null
          ? null
          : Map<String, dynamic>.from(v['google']),
      area: v['area'],
      building: v['building'],
      unit: v['unit'] ?? '',
      instructions: v['instructions'] ?? '',
      point: GeoPoint(
        (v['latitude'] as num).toDouble(),
        (v['longitude'] as num).toDouble(),
      ),
    );
  } catch (_) {
    return null;
  }
}

Map<String, dynamic>? deliveryRecord(Map<String, dynamic> account) {
  for (final raw in account['addresses'] as List) {
    if (raw['kind'] == 'delivery') return Map<String, dynamic>.from(raw);
  }
  return null;
}

Future<void> editAddress(
  BuildContext context,
  MobileApi api,
  Map<String, dynamic> account, {
  bool pickup = false,
  required Future<void> Function() after,
}) async {
  if (api.isDemo) {
    message(
      context,
      'This demo uses fixed fictional entrances. No personal address is needed.',
    );
    return;
  }
  final restaurant = account['restaurant'] as Map?;
  final record = pickup
      ? (restaurant?['pendingPickup'] ?? restaurant?['pickup'])
      : deliveryRecord(account);
  final initial = storedAddress(
    record == null ? null : Map<String, dynamic>.from(record),
  );
  final result = await Navigator.push<PreviewAddress>(
    context,
    MaterialPageRoute(
      builder: (_) => AddressPage(
        places: MobilePlacesLookup(api),
        area: initial?.area ?? account['restaurant']?['area'] ?? 'Malé',
        initial: initial,
        pickup: pickup,
      ),
    ),
  );
  if (result == null) return;
  try {
    await api.request('address', data: result.toJson());
    await after();
    if (context.mounted) {
      message(
        context,
        pickup
            ? 'Entrance saved for admin review.'
            : 'Delivery entrance saved.',
      );
    }
  } catch (e) {
    if (context.mounted) message(context, e.toString());
  }
}

class LiveWorkspace extends StatefulWidget {
  final MobileApi api;
  final Map<String, dynamic> account;
  final Future<void> Function() refreshAccount;
  final Future<void> Function() signOut;
  const LiveWorkspace({
    super.key,
    required this.api,
    required this.account,
    required this.refreshAccount,
    required this.signOut,
  });
  @override
  State<LiveWorkspace> createState() => _LiveWorkspaceState();
}

class _LiveWorkspaceState extends State<LiveWorkspace>
    with WidgetsBindingObserver {
  Map<String, dynamic>? data, catalog;
  String? error;
  bool busy = false, fetching = false, foreground = true;
  int tab = 0, page = 1, catalogPage = 1;
  Timer? timer, filterTimer;
  bool refreshAgain = false;
  String query = '', cuisine = 'All', menuFilter = 'All';
  final orderFeed = ValueNotifier<List<Map<String, dynamic>>>([]);
  int catalogRevision = 0;
  String get role => widget.account['access']['role'];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    refresh();
    timer = Timer.periodic(Duration(seconds: widget.api.isDemo ? 5 : 20), (_) {
      if (foreground) refresh(checkAccount: true);
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    filterTimer?.cancel();
    orderFeed.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (foreground) refresh(checkAccount: true);
  }

  Future<void> refresh({bool checkAccount = false}) async {
    if (fetching) {
      refreshAgain = true;
      return;
    }
    fetching = true;
    final revision = catalogRevision,
        listPage = catalogPage,
        currentQuery = query,
        currentCuisine = cuisine,
        currentStock = menuFilter;
    try {
      if (checkAccount) await widget.refreshAccount();
      final result = await widget.api.request(
        'operations',
        operations: true,
        page: page,
      );
      final list = role == 'customer'
          ? await widget.api.request(
              'catalog',
              page: listPage,
              query: {'q': currentQuery, 'cuisine': currentCuisine},
            )
          : role == 'restaurant'
          ? await widget.api.request(
              'menu',
              page: listPage,
              query: {'q': currentQuery, 'stock': currentStock},
            )
          : null;
      if (mounted) {
        setState(() {
          final oldIds = (data?['notifications'] as List? ?? [])
              .map((n) => n['id'])
              .toSet();
          final incoming = (result['notifications'] as List)
              .where((n) => !oldIds.contains(n['id']))
              .toList();
          if (data != null && incoming.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                message(context, incoming.first['text']);
                if (role == 'rider') SystemSound.play(SystemSoundType.alert);
              }
            });
          }
          data = result;
          orderFeed.value = [
            for (final o in result['orders']) Map<String, dynamic>.from(o),
          ];
          if (revision == catalogRevision && listPage == catalogPage) {
            catalog = list;
          }
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      fetching = false;
      if (mounted && refreshAgain) {
        refreshAgain = false;
        unawaited(refresh());
      }
    }
  }

  void filterCatalog({String? query, String? category}) {
    filterTimer?.cancel();
    setState(() {
      if (query != null) this.query = query;
      if (category != null) cuisine = category;
      catalogPage = 1;
      catalogRevision++;
    });
    filterTimer = Timer(Duration(milliseconds: query == null ? 0 : 450), () {
      if (mounted) refresh();
    });
  }

  Future<void> action(Map<String, dynamic> command) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.api.request('operations', operations: true, data: command);
      await refresh();
    } catch (e) {
      if (mounted) message(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  int get accountTab => role == 'rider' ? 2 : 3;
  int get ordersTab => role == 'rider' ? 1 : 2;
  @override
  Widget build(BuildContext context) => CanvasPage(
    child: FloatingWorkspace(
      labels: role == 'customer'
          ? const ['Home', 'Search', 'Orders', 'Account']
          : role == 'restaurant'
          ? const ['Kitchen', 'Menu', 'Orders', 'Account']
          : const ['Map', 'Deliveries', 'Account'],
      selected: tab,
      onSelected: (v) => setState(() => tab = v),
      header: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 12, 4),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    role == 'restaurant'
                        ? widget.account['restaurant']['name']
                        : role == 'rider'
                        ? 'iGO Delivery'
                        : 'iGO',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 22,
                      letterSpacing: -.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    widget.api.isDemo
                        ? 'DEMO · FICTIONAL DATA · NO CHARGES'
                        : {
                            'customer': 'Your everyday, delivered.',
                            'restaurant': 'Your restaurant workspace.',
                            'rider': 'Your next delivery.',
                          }[role]!,
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                builder: (context) => SafeArea(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      const ListTile(
                        title: Text(
                          'Your updates',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      if ((data?['notifications'] as List? ?? []).isEmpty)
                        const ListTile(title: Text('No updates yet.')),
                      for (final notice
                          in data?['notifications'] as List? ?? [])
                        ListTile(
                          title: Text(notice['text']),
                          subtitle: Text(
                            DateTime.parse(notice['time']).toLocal().toString(),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              tooltip: 'Updates',
              icon: const Icon(Icons.notifications_none),
            ),
            IconButton(
              onPressed: () => refresh(checkAccount: true),
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh, size: 21),
            ),
          ],
        ),
      ),
      body: role == 'rider' && tab == 0
          ? riderMap()
          : RefreshIndicator(
              onRefresh: () => refresh(checkAccount: true),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 118),
                children: [
                  if (error != null)
                    Glass(
                      child: Column(
                        children: [
                          Text(error!),
                          TextButton(
                            onPressed: () => refresh(checkAccount: true),
                            child: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                  if (tab == accountTab)
                    profile()
                  else if (tab == ordersTab)
                    orders()
                  else if (role == 'customer')
                    restaurants()
                  else if (role == 'restaurant')
                    (tab == 1 ? restaurantMenu() : restaurantHome())
                  else
                    riderHome(),
                ],
              ),
            ),
    ),
  );
  Widget profile() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Glass(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.account['name'],
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Text('${role[0].toUpperCase()}${role.substring(1)} · approved'),
            const SizedBox(height: 12),
            if (role == 'customer') ...[
              Text(
                storedAddress(deliveryRecord(widget.account))?.label ??
                    'No delivery entrance saved.',
              ),
              TextButton.icon(
                onPressed: () => editAddress(
                  context,
                  widget.api,
                  widget.account,
                  after: widget.refreshAccount,
                ),
                icon: const Icon(Icons.pin_drop_outlined),
                label: const Text('Manage delivery entrance'),
              ),
            ],
            if (role == 'restaurant') ...[
              Text(
                storedAddress(widget.account['restaurant']['pickup'])?.label ??
                    'Pickup entrance pending.',
              ),
              if (widget.account['restaurant']['pendingPickup'] != null)
                const Text('Entrance change awaiting admin review.'),
              TextButton.icon(
                onPressed: () => editAddress(
                  context,
                  widget.api,
                  widget.account,
                  pickup: true,
                  after: widget.refreshAccount,
                ),
                icon: const Icon(Icons.pin_drop_outlined),
                label: const Text('Update pickup entrance'),
              ),
            ],
            if (role == 'rider') ...[
              Text('Service area: ${widget.account['rider']['area']}'),
              for (final area in ServiceArea.values)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => setAvailability(
                          widget.account['rider']['online'] == true,
                          area: area.name,
                        ),
                  child: Text('Work in ${area.name}'),
                ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 16),
      PolicyLinks(api: widget.api),
      const Text(
        'Order problems and valid payment remedies can be raised from the order’s Help button.',
        style: TextStyle(color: muted),
      ),
      if (!widget.api.isDemo)
        TextButton(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const DemoJoinPage()),
          ),
          child: const Text('Try shared demo'),
        ),
      TextButton(
        onPressed: widget.signOut,
        child: Text(
          widget.api.isDemo ? 'Change demo role / leave session' : 'Sign out',
        ),
      ),
    ],
  );
  Future<void> setAvailability(bool online, {String? area}) async {
    setState(() => busy = true);
    try {
      await widget.api.request(
        'availability',
        data: {'online': online, 'area': ?area},
      );
      await widget.refreshAccount();
      await refresh();
    } catch (e) {
      if (mounted) message(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget restaurants() {
    if (catalog == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final address = storedAddress(deliveryRecord(widget.account));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DeliveryAddressHeader(
          address: address?.building ?? 'Choose your address',
          area: address?.area ?? 'Malé / Hulhumalé',
          onTap: () => editAddress(
            context,
            widget.api,
            widget.account,
            after: widget.refreshAccount,
          ),
        ),
        const SizedBox(height: 18),
        TextField(
          key: const ValueKey('catalog-search'),
          onChanged: (v) => filterCatalog(query: v),
          decoration: const InputDecoration(
            hintText: 'Food, restaurants, and little cravings',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        const SizedBox(height: 14),
        CuisineFilters(
          selected: cuisine,
          onSelected: (v) => filterCatalog(category: v),
        ),
        if (tab == 0 &&
            query.isEmpty &&
            cuisine == 'All' &&
            (catalog!['items'] as List).isNotEmpty) ...[
          const SectionHeading(
            title: 'A taste of your islands',
            subtitle: 'Explore the kitchens on this page',
          ),
          RestaurantRail(
            cards: [
              for (final r in (catalog!['items'] as List).take(5))
                restaurantCard(Map<String, dynamic>.from(r), compact: true),
            ],
          ),
        ],
        SectionHeading(
          title: tab == 1
              ? 'Find your next favourite'
              : 'Good food, right here',
          subtitle: '${catalog!['total']} restaurants',
        ),
        if ((catalog!['items'] as List).isEmpty)
          Glass(
            child: Text(
              query.isNotEmpty || cuisine != 'All'
                  ? 'No restaurants match. Try another search or cuisine.'
                  : 'Restaurants will appear here after approval and menu setup.',
            ),
          ),
        for (final r in catalog!['items'])
          restaurantCard(Map<String, dynamic>.from(r)),
        pagination(catalog!, catalogPage, (p) {
          setState(() => catalogPage = p);
          refresh();
        }),
      ],
    );
  }

  Widget restaurantCard(Map<String, dynamic> r, {bool compact = false}) =>
      RestaurantCard(
        name: r['name'],
        subtitle: '${r['cuisine']} · ${r['area']}',
        compact: compact,
        detail: r['acceptingOrders'] == true
            ? '${r['prepTime']} min preparation'
            : 'Currently closed',
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => LiveMenu(
              api: widget.api,
              restaurant: r,
              account: widget.account,
              refreshAccount: widget.refreshAccount,
              onOrderPlaced: () {
                setState(() => tab = ordersTab);
                refresh();
              },
            ),
          ),
        ),
      );

  Widget restaurantHome() {
    final online = widget.account['restaurant']['acceptingOrders'] == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WorkspaceHeading(
          eyebrow: 'Kitchen workspace',
          title: 'Let’s serve something good.',
          trailing: StatusPill(online ? 'OPEN' : 'CLOSED'),
        ),
        const SizedBox(height: 20),
        Glass(
          padding: const EdgeInsets.all(14),
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: online,
            onChanged: busy ? null : setAvailability,
            title: const Text(
              'Accepting orders',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text(
              online
                  ? 'Your kitchen is open.'
                  : 'Open when your kitchen is ready.',
            ),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Glass(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${catalog?['itemCount'] ?? '—'}',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const Text(
                      'Menu items',
                      style: TextStyle(fontSize: 11, color: muted),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Glass(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${catalog?['availableCount'] ?? '—'}',
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const Text(
                      'Available',
                      style: TextStyle(fontSize: 11, color: muted),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => setState(() => tab = 1),
          icon: const Icon(Icons.restaurant_menu),
          label: const Text('Manage your menu'),
        ),
        const SectionHeading(
          title: 'Kitchen queue',
          subtitle: 'Confirm · prepare · hand over',
        ),
        orders(showHeading: false),
      ],
    );
  }

  Widget restaurantMenu() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      WorkspaceHeading(
        eyebrow: 'Your restaurant',
        title: 'Your menu.',
        trailing: IconButton.filledTonal(
          tooltip: 'Add menu item',
          onPressed: busy ? null : () => editMenu(),
          icon: const Icon(Icons.add),
        ),
      ),
      const SizedBox(height: 18),
      TextField(
        key: const ValueKey('menu-search'),
        onChanged: (v) => filterCatalog(query: v),
        decoration: const InputDecoration(
          hintText: 'Find a menu item',
          prefixIcon: Icon(Icons.search),
        ),
      ),
      const SizedBox(height: 14),
      Wrap(
        spacing: 8,
        children: [
          for (final f in ['All', 'Available', 'Out of stock'])
            ChoiceChip(
              label: Text(f),
              selected: menuFilter == f,
              onSelected: (_) {
                setState(() {
                  menuFilter = f;
                  catalogPage = 1;
                  catalogRevision++;
                });
                refresh();
              },
            ),
        ],
      ),
      const SizedBox(height: 18),
      if (catalog == null)
        const Center(child: CircularProgressIndicator())
      else ...[
        if ((catalog!['items'] as List).isEmpty)
          const Glass(
            child: Text('No items here. Add an item or choose another filter.'),
          ),
        for (final item in catalog!['items'])
          MenuItemTile(
            name: item['name'],
            description: item['description'],
            amount: price(item['price']),
            category: item['category'] ?? 'General',
            available: item['available'],
            onTap: busy
                ? null
                : () => editMenu(Map<String, dynamic>.from(item)),
            controls: Row(
              children: [
                Expanded(
                  child: Text(
                    item['available'] == true ? 'Available' : 'Out of stock',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Switch(
                  value: item['available'],
                  onChanged: busy ? null : (v) => updateStock(item['id'], v),
                ),
                IconButton(
                  tooltip: 'Edit ${item['name']}',
                  onPressed: busy
                      ? null
                      : () => editMenu(Map<String, dynamic>.from(item)),
                  icon: const Icon(Icons.edit_outlined, size: 20),
                ),
              ],
            ),
          ),
        pagination(catalog!, catalogPage, (p) {
          setState(() {
            catalogPage = p;
            catalogRevision++;
          });
          refresh();
        }),
      ],
    ],
  );
  Future<void> updateStock(String id, bool available) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.api.request(
        'menu-stock',
        data: {'id': id, 'available': available},
      );
      if (mounted) setState(() => catalogRevision++);
      await refresh();
    } catch (e) {
      if (mounted) message(context, e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> editMenu([Map<String, dynamic>? item]) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => MenuEditorPage(
          item: item,
          onSave: (value) async {
            await widget.api.request('menu', data: value);
          },
          onDelete: item == null
              ? null
              : () async {
                  await widget.api.request(
                    'menu-delete',
                    data: {'id': item['id']},
                  );
                },
        ),
      ),
    );
    if (changed == true && mounted) {
      setState(() {
        catalogPage = 1;
        catalogRevision++;
      });
      await refresh();
    }
  }

  Widget riderMap() {
    final jobs = (data?['orders'] as List? ?? [])
        .where((o) => o['delivery'] != 'Delivery complete')
        .toList();
    final job = jobs.firstOrNull;
    final pickup = job?['job']?['pickup'],
        destination = job?['job']?['destination'];
    final online = widget.account['rider']['online'] == true;
    final next = {
      'Order assigned': 'Arrived at restaurant',
      'Arrived at restaurant': 'Order picked up',
      'Order picked up': 'Arrived at customer',
      'Arrived at customer': 'Delivery complete',
    }[job?['delivery']];
    final point =
        job?['delivery'] == 'Order picked up' ||
            job?['delivery'] == 'Arrived at customer'
        ? destination
        : pickup;
    return RiderMapWorkspace(
      area: widget.account['rider']['area'],
      online: online,
      pickup: pickup == null
          ? null
          : GeoPoint(
              (pickup['lat'] as num).toDouble(),
              (pickup['lng'] as num).toDouble(),
            ),
      destination: destination == null
          ? null
          : GeoPoint(
              (destination['lat'] as num).toDouble(),
              (destination['lng'] as num).toDouble(),
            ),
      onAvailability: busy || job != null
          ? null
          : () => setAvailability(!online),
      panel: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (error != null) ...[
            Text(error!),
            TextButton(onPressed: refresh, child: const Text('Try again')),
          ],
          if (job != null) ...[
            Text(
              job['restaurant'] ?? 'Your delivery',
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
            ),
            Text(
              '${job['publicId']} · ${job['items']}',
              style: const TextStyle(fontSize: 12, color: muted),
            ),
            const SizedBox(height: 10),
            Text(
              job['delivery'],
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            Text(
              point == pickup
                  ? (job['job']?['pickupLabel'] ?? '')
                  : (job['job']?['address'] ?? ''),
              style: const TextStyle(fontSize: 12),
            ),
            if (point != null)
              TextButton.icon(
                onPressed: () => openLink(
                  context,
                  directions(
                    (point['lat'] as num).toDouble(),
                    (point['lng'] as num).toDouble(),
                  ),
                ),
                icon: const Icon(Icons.navigation_outlined, size: 18),
                label: const Text('Open Google Maps directions'),
              ),
            if (next != null)
              FilledButton(
                onPressed:
                    busy ||
                        (next == 'Order picked up' &&
                            job['preparation'] != 'Ready for pickup')
                    ? null
                    : () => action({
                        'type': 'delivery',
                        'id': job['id'],
                        'status': next,
                      }),
                child: Text(next),
              ),
            if (next == 'Order picked up' &&
                job['preparation'] != 'Ready for pickup')
              const Text(
                'Waiting for the kitchen to mark the food ready.',
                style: TextStyle(fontSize: 11, color: muted),
              ),
          ] else if (data == null)
            const LinearProgressIndicator()
          else ...[
            if ((data!['offers'] as List).isEmpty)
              Text(
                online
                    ? 'Waiting for requests in your service area.'
                    : 'Go online when you’re ready to deliver.',
                style: const TextStyle(fontSize: 13, color: muted),
              ),
            for (final offer in data!['offers']) ...[
              const SizedBox(height: 12),
              Text(
                offer['restaurant'] ?? 'Restaurant',
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                '${offer['items']} · ${offer['area']}',
                style: const TextStyle(fontSize: 12),
              ),
              Text(
                'Respond by ${DateTime.parse(offer['expiresAt']).toLocal().toString().substring(11, 19)}',
                style: const TextStyle(fontSize: 11, color: muted),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed:
                    busy ||
                        DateTime.parse(offer['expiresAt'])
                            .isBefore(DateTime.now())
                    ? null
                    : () => action({
                        'type': 'accept-offer',
                        'id': offer['orderId'],
                      }),
                child: const Text('Accept delivery'),
              ),
            ],
            if (!online) ...[
              const SizedBox(height: 16),
              FilledButton(
                onPressed: busy ? null : () => setAvailability(true),
                child: const Text('Go online'),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget riderHome() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Glass(
        child: SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: widget.account['rider']['online'] == true,
          onChanged: busy ? null : setAvailability,
          title: const Text('Available for deliveries'),
          subtitle: Text(widget.account['rider']['area']),
        ),
      ),
      const SizedBox(height: 24),
      const Text(
        'Delivery requests',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      if (data == null)
        const Center(child: CircularProgressIndicator())
      else ...[
        if ((data!['offers'] as List).isEmpty)
          const Glass(
            child: Text(
              'Requests in your service area appear here while you’re online and available.',
            ),
          ),
        for (final offer in data!['offers'])
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Glass(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    offer['restaurant'] ?? 'Restaurant',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text('${offer['items']} · ${offer['area']}'),
                  Text(
                    'Respond by ${DateTime.parse(offer['expiresAt']).toLocal().toString().substring(11, 19)}',
                    style: const TextStyle(color: muted),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed:
                        busy ||
                            DateTime.parse(offer['expiresAt'])
                                .isBefore(DateTime.now())
                        ? null
                        : () => action({
                            'type': 'accept-offer',
                            'id': offer['orderId'],
                          }),
                    child: const Text('Accept request'),
                  ),
                ],
              ),
            ),
          ),
      ],
      const SizedBox(height: 20),
      orders(),
    ],
  );
  Widget orders({bool showHeading = true}) {
    if (data == null) return const Center(child: CircularProgressIndicator());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showHeading)
          const Text(
            'Orders',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
          ),
        const SizedBox(height: 16),
        if ((data!['orders'] as List).isEmpty)
          const Glass(
            child: Text(
              'No orders yet. Confirmed, paid orders will appear here.',
            ),
          ),
        for (final order in data!['orders'])
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: orderCard(Map<String, dynamic>.from(order)),
          ),
        pagination(data!, page, (p) {
          setState(() => page = p);
          refresh();
        }),
      ],
    );
  }

  Widget orderCard(Map<String, dynamic> order) {
    final preparation = order['preparation'], delivery = order['delivery'];
    final nextPreparation = {
      'Awaiting confirmation': 'Order confirmed',
      'Order confirmed': 'Ready for pickup',
      'Ready for pickup': 'Order picked up',
    }[preparation];
    final nextDelivery = {
      'Order assigned': 'Arrived at restaurant',
      'Arrived at restaurant': 'Order picked up',
      'Order picked up': 'Arrived at customer',
      'Arrived at customer': 'Delivery complete',
    }[delivery];
    if (role == 'customer') {
      return Glass(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                StatusPill(order['status'] ?? preparation),
                const Spacer(),
                const Icon(Icons.shopping_bag_outlined, size: 22),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              order['restaurant'] ?? 'Your restaurant',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            Text(
              order['items'] ?? '',
              style: const TextStyle(fontSize: 12, color: muted),
            ),
            const SizedBox(height: 20),
            OrderProgress(
              stage: deliveryStage(
                preparation,
                delivery,
                order['rider'] != null,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              order['estimatedDelivery'] ?? '',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => OrderDetailPage(
                    order: order,
                    feed: orderFeed,
                    onHelp: () => help(order['id']),
                  ),
                ),
              ),
              child: const Text('View order progress'),
            ),
            const SizedBox(height: 10),
            Text(
              order['publicId'] ?? order['id'],
              style: const TextStyle(fontSize: 10, color: muted),
            ),
          ],
        ),
      );
    }
    return Glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StatusPill(preparation),
              const Spacer(),
              const Icon(Icons.receipt_long_outlined, size: 22),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            order['restaurant'] ?? 'Kitchen order',
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            order['publicId'] ?? order['id'],
            style: const TextStyle(color: muted, fontSize: 11),
          ),
          const SizedBox(height: 14),
          Text(order['items'] ?? ''),
          const Divider(height: 28),
          Row(
            children: [
              Expanded(
                child: Text(
                  price(order['amount']),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              StatusPill(delivery),
            ],
          ),
          if (order['rider'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Rider · ${order['rider']}',
                style: const TextStyle(fontSize: 12, color: muted),
              ),
            ),
          const SizedBox(height: 12),
          if (role == 'restaurant' && nextPreparation != null)
            FilledButton(
              onPressed:
                  busy ||
                      (nextPreparation == 'Order picked up' &&
                          delivery != 'Arrived at restaurant')
                  ? null
                  : () => action({
                      'type': 'preparation',
                      'id': order['id'],
                      'status': nextPreparation,
                    }),
              child: Text(
                {
                  'Order confirmed': 'Confirm order',
                  'Ready for pickup': 'Mark ready for pickup',
                  'Order picked up': 'Confirm handover',
                }[nextPreparation]!,
              ),
            ),
          if (role == 'rider') ...[
            if (delivery != 'Delivery complete' &&
                order['job']?['pickup'] != null &&
                order['job']?['destination'] != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: JobMap(
                  pickup: GeoPoint(
                    (order['job']['pickup']['lat'] as num).toDouble(),
                    (order['job']['pickup']['lng'] as num).toDouble(),
                  ),
                  destination: GeoPoint(
                    (order['job']['destination']['lat'] as num).toDouble(),
                    (order['job']['destination']['lng'] as num).toDouble(),
                  ),
                ),
              ),
            for (final entry in {
              'pickup': 'Navigate to restaurant',
              'destination': 'Navigate to customer',
            }.entries)
              if (order['job']?[entry.key] != null)
                TextButton.icon(
                  onPressed: () => openLink(
                    context,
                    directions(
                      (order['job'][entry.key]['lat'] as num).toDouble(),
                      (order['job'][entry.key]['lng'] as num).toDouble(),
                    ),
                  ),
                  icon: const Icon(Icons.navigation_outlined),
                  label: Text(entry.value),
                ),
            Text(order['job']?['pickupLabel'] ?? ''),
            Text(order['job']?['address'] ?? ''),
            if (nextDelivery != null)
              FilledButton(
                onPressed:
                    busy ||
                        (nextDelivery == 'Order picked up' &&
                            preparation != 'Ready for pickup')
                    ? null
                    : () => action({
                        'type': 'delivery',
                        'id': order['id'],
                        'status': nextDelivery,
                      }),
                child: Text(nextDelivery),
              ),
          ],
          if (role == 'customer')
            TextButton(
              onPressed: () => help(order['id']),
              child: const Text('Get help with this order'),
            ),
          if ((order['events'] as List).isNotEmpty)
            ExpansionTile(
              title: const Text('Order timeline'),
              children: [
                for (final e in (order['events'] as List).reversed.take(10))
                  ListTile(
                    title: Text(e['text']),
                    subtitle: Text(
                      DateTime.parse(e['at']).toLocal().toString(),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> help(String id) async {
    final controller = TextEditingController();
    String? error;
    bool saving = false;
    final route = DialogRoute<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: const Text('How can we help?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Report missing items, non-delivery or a payment problem. Please leave card details out of your message.',
              ),
              TextField(controller: controller, maxLength: 500, maxLines: 3),
              if (error != null) Text(error!),
            ],
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialog),
              child: const Text('Close'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      if (controller.text.trim().length < 10) {
                        setDialog(
                          () => error =
                              'Describe the issue in at least 10 characters.',
                        );
                        return;
                      }
                      setDialog(() => saving = true);
                      try {
                        await widget.api.request(
                          'support',
                          data: {
                            'orderId': id,
                            'subject': controller.text.trim(),
                          },
                        );
                        if (dialog.mounted) Navigator.pop(dialog);
                        if (mounted) {
                          message(
                            this.context,
                            'Your support case has been submitted.',
                          );
                        }
                      } catch (e) {
                        if (dialog.mounted) {
                          setDialog(() => error = e.toString());
                        }
                      } finally {
                        if (dialog.mounted) setDialog(() => saving = false);
                      }
                    },
              child: Text(saving ? 'Sending…' : 'Send'),
            ),
          ],
        ),
      ),
    );
    await Navigator.of(context).push(route);
    await route.completed;
    controller.dispose();
  }
}

String price(dynamic amount) =>
    'MVR ${((amount as num) / 100).toStringAsFixed(2)}';
Widget pagination(
  Map<String, dynamic> data,
  int page,
  void Function(int) select,
) => Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    TextButton(
      onPressed: page > 1 ? () => select(page - 1) : null,
      child: const Text('Previous'),
    ),
    Text('Page $page'),
    TextButton(
      onPressed: page * 10 < (data['total'] as int)
          ? () => select(page + 1)
          : null,
      child: const Text('Next'),
    ),
  ],
);

class LiveMenu extends StatefulWidget {
  final MobileApi api;
  final Map<String, dynamic> restaurant, account;
  final Future<void> Function() refreshAccount;
  final VoidCallback? onOrderPlaced;
  const LiveMenu({
    super.key,
    required this.api,
    required this.restaurant,
    required this.account,
    required this.refreshAccount,
    this.onOrderPlaced,
  });
  @override
  State<LiveMenu> createState() => _LiveMenuState();
}

class _LiveMenuState extends State<LiveMenu> {
  String category = 'All';
  int revision = 0;
  Map<String, dynamic>? data;
  String? error;
  int page = 1;
  bool busy = false;
  final Map<String, Map<String, dynamic>> cart = {};
  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    final requestRevision = ++revision;
    try {
      final result = await widget.api.request(
        'catalog',
        page: page,
        restaurantId: widget.restaurant['id'],
        query: {'category': category},
      );
      if (mounted && revision == requestRevision) {
        setState(() {
          data = result;
          error = null;
        });
      }
    } catch (e) {
      if (mounted && requestRevision == revision) {
        setState(() => error = e.toString());
      }
    }
  }

  int get subtotal => cart.values.fold(
    0,
    (sum, i) => sum + (i['price'] as int) * (i['quantity'] as int),
  );
  void quantity(Map<String, dynamic> item, int change) {
    setState(() {
      final old = cart[item['id']],
          count = (old?['quantity'] as int? ?? 0) + change;
      if (count < 1) {
        cart.remove(item['id']);
      } else if (count <= 20) {
        cart[item['id']] = {...item, 'quantity': count};
      }
    });
  }

  Future<void> checkout() async {
    if (cart.isEmpty) return;
    final placed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => LiveCheckout(
          api: widget.api,
          restaurant: widget.restaurant,
          cart: cart.values.map((i) => Map<String, dynamic>.from(i)).toList(),
          refreshAccount: widget.refreshAccount,
        ),
      ),
    );
    if (placed == true && mounted) {
      cart.clear();
      widget.onOrderPlaced?.call();
      Navigator.pop(context);
      message(context, 'Demo order submitted. No charge was made.');
    }
  }

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
                height: 165,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFEE9F), Color(0xFFF8F4E9)],
                  ),
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.restaurant_menu, size: 48),
                    SizedBox(height: 10),
                    Text(
                      'Fresh from the kitchen.',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Restaurant photo coming soon',
                      style: TextStyle(color: muted, fontSize: 11),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Text(
                widget.restaurant['name'],
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              Text(
                '${widget.restaurant['cuisine']} · ${widget.restaurant['area']}',
                style: const TextStyle(color: muted),
              ),
              const SizedBox(height: 8),
              if (widget.restaurant['prepTime'] != null)
                Text(
                  '${widget.restaurant['prepTime']} min preparation',
                  style: const TextStyle(fontSize: 12),
                ),
              const SizedBox(height: 24),
              Text(
                'On the menu',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              if (error != null) ...[
                Text(error!),
                TextButton(onPressed: refresh, child: const Text('Try again')),
              ],
              if (data == null && error == null)
                const Center(child: CircularProgressIndicator()),
              if (data != null) ...[
                if (data!['restaurant']['acceptingOrders'] != true)
                  const Glass(
                    child: Text('This restaurant is currently closed.'),
                  ),
                if ((data!['items'] as List).isEmpty)
                  const Glass(
                    child: Text('The menu is being prepared. Check back soon.'),
                  ),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final c in [
                      'All',
                      ...(data!['categories'] as List? ?? []),
                    ])
                      ChoiceChip(
                        label: Text(c),
                        selected: category == c,
                        onSelected: (_) {
                          setState(() {
                            category = c;
                            page = 1;
                          });
                          refresh();
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                for (final item in data!['items'])
                  MenuItemTile(
                    name: item['name'],
                    description: item['description'],
                    amount: price(item['price']),
                    category: item['category'] ?? 'General',
                    controls: Row(
                      children: [
                        const Spacer(),
                        IconButton(
                          tooltip: 'Remove ${item['name']}',
                          onPressed: () =>
                              quantity(Map<String, dynamic>.from(item), -1),
                          icon: const Icon(Icons.remove),
                        ),
                        Text('${cart[item['id']]?['quantity'] ?? 0}'),
                        IconButton.filledTonal(
                          tooltip: 'Add ${item['name']}',
                          onPressed:
                              data!['restaurant']['acceptingOrders'] == true
                              ? () =>
                                    quantity(Map<String, dynamic>.from(item), 1)
                              : null,
                          icon: const Icon(Icons.add),
                        ),
                      ],
                    ),
                  ),
                pagination(data!, page, (p) {
                  setState(() => page = p);
                  refresh();
                }),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
          child: Glass(
            padding: const EdgeInsets.all(8),
            child: FilledButton(
              onPressed:
                  cart.isNotEmpty &&
                      data?['restaurant']['acceptingOrders'] == true
                  ? checkout
                  : null,
              child: Text('View cart · ${price(subtotal)}'),
            ),
          ),
        ),
      ],
    ),
  );
}

class LiveCheckout extends StatefulWidget {
  final MobileApi api;
  final Map<String, dynamic> restaurant;
  final List<Map<String, dynamic>> cart;
  final Future<void> Function() refreshAccount;
  const LiveCheckout({
    super.key,
    required this.api,
    required this.restaurant,
    required this.cart,
    required this.refreshAccount,
  });
  @override
  State<LiveCheckout> createState() => _LiveCheckoutState();
}

class _LiveCheckoutState extends State<LiveCheckout> {
  Map<String, dynamic>? account, quote;
  String? error;
  bool busy = false;
  final note = TextEditingController();
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final a = await widget.api.request('account');
      if (mounted) setState(() => account = a);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> review() async {
    final address = account == null ? null : deliveryRecord(account!);
    if (address == null) {
      setState(() => error = 'Save your delivery entrance first.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final q = await widget.api.request(
        'quote',
        data: {
          'restaurantId': widget.restaurant['id'],
          'addressId': address['id'],
          'items': widget.cart
              .map((i) => {'id': i['id'], 'quantity': i['quantity']})
              .toList(),
          'note': note.text.trim(),
        },
      );
      if (mounted) setState(() => quote = q);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> payDemo() async {
    if (busy ||
        quote == null ||
        !widget.api.isDemo ||
        account?['demoCheckoutEnabled'] != true ||
        quote?['demo'] != true) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final attempt = await widget.api.request(
        'checkout',
        data: {'quoteId': quote!['id']},
      );
      if (!mounted) return;
      if (attempt['demo'] != true) {
        throw const ApiFailure('Unexpected demo checkout response.');
      }
      final result = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (_) => DemoBankPage(api: widget.api, attempt: attempt),
        ),
      );
      if (!mounted) return;
      if (result?['status'] == 'Approved') {
        Navigator.pop(context, true);
      } else if (result != null) {
        setState(() => quote = null);
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

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
        Text(
          widget.api.isDemo ? 'Your demo cart' : 'Your cart',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 20),
        Glass(
          child: Column(
            children: [
              for (final item
                  in (quote?['snapshot']?['lineItems'] as List? ?? widget.cart))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${item['name']} × ${item['quantity']}'),
                  trailing: Text(
                    price(
                      ((item['unitPrice'] ?? item['price']) as int) *
                          (item['quantity'] as int),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Glass(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Delivery entrance',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
              Text(
                account == null
                    ? 'Loading…'
                    : storedAddress(deliveryRecord(account!))?.label ??
                          'Choose your building entrance',
              ),
              TextButton(
                onPressed: account == null || busy || widget.api.isDemo
                    ? null
                    : () async {
                        await editAddress(
                          context,
                          widget.api,
                          account!,
                          after: () async {
                            await load();
                            await widget.refreshAccount();
                          },
                        );
                        if (mounted) setState(() => quote = null);
                      },
                child: Text(
                  widget.api.isDemo
                      ? 'Fictional demo entrance'
                      : 'Change entrance',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: note,
          maxLength: 300,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'Note for the restaurant',
          ),
          onChanged: (_) => setState(() => quote = null),
        ),
        if (error != null)
          Text(error!, style: const TextStyle(color: Colors.red)),
        FilledButton(
          onPressed: busy ? null : review,
          child: Text(busy ? 'Checking…' : 'Review total'),
        ),
        if (quote != null) ...[
          const SizedBox(height: 16),
          Glass(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Subtotal: ${price(quote!['snapshot']['subtotal'])}'),
                Text('Delivery: ${price(quote!['snapshot']['deliveryFee'])}'),
                Text(
                  'Total: ${price(quote!['amount'])}',
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Text(
                  'Prices checked against the current menu. Quote valid for 15 minutes.',
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        widget.api.isDemo
            ? const Glass(
                child: Column(
                  children: [
                    Icon(Icons.science_outlined),
                    Text(
                      'iGO Demo Bank',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Simulate approval, decline or cancellation. No card details and no real charge. A demo order is submitted only after simulated approval.',
                    ),
                  ],
                ),
              )
            : const Glass(
                child: Column(
                  children: [
                    Icon(Icons.credit_card),
                    Text(
                      'BML card checkout is being prepared.',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Payment collection is disabled. No order will be submitted from this screen yet.',
                    ),
                  ],
                ),
              ),
        const SizedBox(height: 16),
        widget.api.isDemo
            ? FilledButton(
                onPressed:
                    busy ||
                        quote == null ||
                        account?['demoCheckoutEnabled'] != true
                    ? null
                    : payDemo,
                child: Text(
                  busy ? 'Opening demo bank…' : 'Continue to demo bank',
                ),
              )
            : const FilledButton(
                onPressed: null,
                child: Text('Pay by card & submit order'),
              ),
        const SizedBox(height: 12),
        const Text(
          'After verified payment and order confirmation, change-of-mind cancellation is unavailable. Help remains available for order or payment problems.',
          style: TextStyle(color: muted),
        ),
        PolicyLinks(api: widget.api),
      ],
    ),
  );
}
