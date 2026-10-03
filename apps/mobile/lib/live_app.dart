import 'dart:async';

import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'main.dart' show CanvasPage, Glass, AddressPage, yellow, ink, muted;
import 'models.dart';
import 'mobile_api.dart';
import 'native_glass_bar.dart';

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
            const Text(
              'Welcome to iGO',
              style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
            ),
            const Text('Sign in or create your account to continue.'),
            const SizedBox(height: 24),
            const ClerkAuthentication(),
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
  Widget build(BuildContext context) => Wrap(
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
  Timer? timer;
  String get role => widget.account['access']['role'];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    refresh();
    timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (foreground) refresh(checkAccount: true);
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (foreground) refresh(checkAccount: true);
  }

  Future<void> refresh({bool checkAccount = false}) async {
    if (fetching) return;
    fetching = true;
    try {
      if (checkAccount) await widget.refreshAccount();
      final result = await widget.api.request(
        'operations',
        operations: true,
        page: page,
      );
      final list = role == 'customer'
          ? await widget.api.request('catalog', page: catalogPage)
          : role == 'restaurant'
          ? await widget.api.request('menu', page: catalogPage)
          : null;
      if (mounted) {
        setState(() {
          final oldIds=(data?['notifications'] as List? ?? []).map((n)=>n['id']).toSet();
          final incoming=(result['notifications'] as List).where((n)=>!oldIds.contains(n['id'])).toList();
          if(data!=null && incoming.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_){if(mounted){message(context,incoming.first['text']);if(role=='rider')SystemSound.play(SystemSoundType.alert);}});
          }
          data = result;
          catalog = list;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      fetching = false;
    }
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

  @override
  Widget build(BuildContext context) => CanvasPage(
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Hi, ${widget.account['name']}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      {
                        'customer': 'Your everyday, delivered.',
                        'restaurant': 'Your restaurant workspace.',
                        'rider': 'Your next delivery.',
                      }[role]!,
                      style: const TextStyle(color: muted),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed:()=>showModalBottomSheet<void>(context:context,builder:(context)=>SafeArea(child:ListView(shrinkWrap:true,children:[const ListTile(title:Text('Your updates',style:TextStyle(fontWeight:FontWeight.w700))),if((data?['notifications'] as List? ?? []).isEmpty)const ListTile(title:Text('No updates yet.')),for(final notice in data?['notifications'] as List? ?? [])ListTile(title:Text(notice['text']),subtitle:Text(DateTime.parse(notice['time']).toLocal().toString()))]))),
                tooltip:'Updates',icon:const Icon(Icons.notifications_none),
              ),
              IconButton(
                onPressed: () => refresh(checkAccount: true),
                tooltip: 'Refresh',
                icon: const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => refresh(checkAccount: true),
            child: ListView(
              padding: const EdgeInsets.all(20),
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
                if (tab == 2)
                  profile()
                else if (tab == 1)
                  orders()
                else if (role == 'customer')
                  restaurants()
                else if (role == 'restaurant')
                  restaurantHome()
                else
                  riderHome(),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: NativeGlassBar(
            labels: role == 'customer'
                ? const ['Explore', 'Orders', 'Account']
                : role == 'restaurant'
                ? const ['Kitchen', 'Orders', 'Account']
                : const ['Requests', 'Deliveries', 'Account'],
            selected: tab,
            onSelected: (v) => setState(() => tab = v),
          ),
        ),
      ],
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
      TextButton(onPressed: widget.signOut, child: const Text('Sign out')),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Glass(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Deliver to', style: TextStyle(color: muted)),
              Text(
                storedAddress(deliveryRecord(widget.account))?.label ??
                    'Choose your building entrance',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              TextButton(
                onPressed: () => editAddress(
                  context,
                  widget.api,
                  widget.account,
                  after: widget.refreshAccount,
                ),
                child: const Text('Change entrance'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Good food.\nCloser than ever.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 16),
        if ((catalog!['items'] as List).isEmpty)
          const Glass(
            child: Text(
              'Restaurants will appear here after approval and menu setup.',
            ),
          ),
        for (final r in catalog!['items'])
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Glass(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(
                  backgroundColor: yellow,
                  child: Icon(Icons.restaurant, color: ink),
                ),
                title: Text(
                  r['name'],
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  '${r['cuisine']} · ${r['area']}\n${r['acceptingOrders'] == true ? '${r['prepTime']} min preparation' : 'Currently closed'}',
                ),
                trailing: const Icon(Icons.arrow_forward),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LiveMenu(
                      api: widget.api,
                      restaurant: Map<String, dynamic>.from(r),
                      account: widget.account,
                      refreshAccount: widget.refreshAccount,
                    ),
                  ),
                ),
              ),
            ),
          ),
        pagination(catalog!, catalogPage, (p) {
          setState(() => catalogPage = p);
          refresh();
        }),
      ],
    );
  }

  Widget restaurantHome() {
    final online = widget.account['restaurant']['acceptingOrders'] == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Glass(
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: online,
            onChanged: busy ? null : setAvailability,
            title: const Text('Accepting orders'),
            subtitle: Text(
              online ? 'Your kitchen is open.' : 'Your kitchen is closed.',
            ),
          ),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Your menu',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
            ),
            TextButton.icon(
              onPressed: () => editMenu(),
              icon: const Icon(Icons.add),
              label: const Text('Add item'),
            ),
          ],
        ),
        if (catalog == null)
          const Center(child: CircularProgressIndicator())
        else ...[
          if ((catalog!['items'] as List).isEmpty)
            const Glass(
              child: Text('Add your first menu item, then open your kitchen.'),
            ),
          for (final item in catalog!['items'])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Glass(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item['name']),
                  subtitle: Text(
                    '${price(item['price'])} · ${item['available'] == true ? 'Available' : 'Unavailable'}',
                  ),
                  trailing: const Icon(Icons.edit_outlined),
                  onTap: () => editMenu(Map<String, dynamic>.from(item)),
                ),
              ),
            ),
          pagination(catalog!, catalogPage, (p) {
            setState(() => catalogPage = p);
            refresh();
          }),
        ],
        const SizedBox(height: 20),
        orders(),
      ],
    );
  }

  Future<void> editMenu([Map<String, dynamic>? item]) async {
    final name = TextEditingController(text: item?['name'] ?? ''),
        description = TextEditingController(text: item?['description'] ?? ''),
        amount = TextEditingController(
          text: item == null
              ? ''
              : ((item['price'] as int) / 100).toStringAsFixed(2),
        );
    bool available = item?['available'] ?? true;
    String? error;
    bool saving = false;
    final form = GlobalKey<FormState>();
    final route = DialogRoute<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialog) => AlertDialog(
          title: Text(item == null ? 'Add menu item' : 'Edit menu item'),
          content: SingleChildScrollView(
            child: Form(
              key: form,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: name,
                    maxLength: 100,
                    decoration: const InputDecoration(labelText: 'Name'),
                    validator: (v) => (v?.trim().length ?? 0) < 2
                        ? 'Enter an item name.'
                        : null,
                  ),
                  TextFormField(
                    controller: description,
                    maxLength: 300,
                    decoration: const InputDecoration(
                      labelText: 'Description / allergen information',
                    ),
                  ),
                  TextFormField(
                    controller: amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(labelText: 'Price (MVR)'),
                    validator: (v) =>
                        RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(v ?? '') &&
                            (double.tryParse(v ?? '') ?? 0) >= 1 &&
                            (double.tryParse(v ?? '') ?? 0) <= 10000
                        ? null
                        : 'Use MVR 1–10,000 with up to two decimals.',
                  ),
                  SwitchListTile(
                    title: const Text('Available'),
                    value: available,
                    onChanged: saving
                        ? null
                        : (v) => setDialog(() => available = v),
                  ),
                  if (error != null)
                    Text(error!, style: const TextStyle(color: Colors.red)),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      if (!form.currentState!.validate()) return;
                      setDialog(() => saving = true);
                      try {
                        await widget.api.request(
                          'menu',
                          data: {
                            if (item != null) 'id': item['id'],
                            'name': name.text.trim(),
                            'description': description.text.trim(),
                            'price': (double.parse(amount.text) * 100).round(),
                            'available': available,
                          },
                        );
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        await refresh();
                      } catch (e) {
                        if (dialogContext.mounted) {
                          setDialog(() => error = e.toString());
                        }
                      } finally {
                        if (dialogContext.mounted) {
                          setDialog(() => saving = false);
                        }
                      }
                    },
              child: Text(saving ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );
    await Navigator.of(context).push(route);
    await route.completed;
    name.dispose();
    description.dispose();
    amount.dispose();
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
  Widget orders() {
    if (data == null) return const Center(child: CircularProgressIndicator());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
    return Glass(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            order['publicId'] ?? order['id'],
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          Text(order['restaurant'] ?? ''),
          const SizedBox(height: 8),
          Text(order['items'] ?? ''),
          Text(price(order['amount'])),
          const Divider(),
          Text('$preparation\n$delivery'),
          if (order['rider'] != null) Text('Rider: ${order['rider']}'),
          Text(
            order['estimatedDelivery'] ?? '',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
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
              child: Text(nextPreparation),
            ),
          if (role == 'rider') ...[
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
  const LiveMenu({
    super.key,
    required this.api,
    required this.restaurant,
    required this.account,
    required this.refreshAccount,
  });
  @override
  State<LiveMenu> createState() => _LiveMenuState();
}

class _LiveMenuState extends State<LiveMenu> {
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
    try {
      final result = await widget.api.request(
        'catalog',
        page: page,
        restaurantId: widget.restaurant['id'],
      );
      if (mounted) {
        setState(() {
          data = result;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
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
    await Navigator.push<void>(
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
        const Icon(Icons.restaurant_menu, size: 64),
        const SizedBox(height: 16),
        Text(
          widget.restaurant['name'],
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        Text('${widget.restaurant['cuisine']} · ${widget.restaurant['area']}'),
        const SizedBox(height: 20),
        if (error != null) ...[
          Text(error!),
          TextButton(onPressed: refresh, child: const Text('Try again')),
        ],
        if (data == null && error == null)
          const Center(child: CircularProgressIndicator()),
        if (data != null) ...[
          if (data!['restaurant']['acceptingOrders'] != true)
            const Glass(child: Text('This restaurant is currently closed.')),
          if ((data!['items'] as List).isEmpty)
            const Glass(
              child: Text('The menu is being prepared. Check back soon.'),
            ),
          for (final item in data!['items'])
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Glass(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['name'],
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(item['description']),
                    Row(
                      children: [
                        Expanded(child: Text(price(item['price']))),
                        IconButton(
                          onPressed: () =>
                              quantity(Map<String, dynamic>.from(item), -1),
                          icon: const Icon(Icons.remove),
                        ),
                        Text('${cart[item['id']]?['quantity'] ?? 0}'),
                        IconButton(
                          onPressed: () =>
                              quantity(Map<String, dynamic>.from(item), 1),
                          icon: const Icon(Icons.add),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          pagination(data!, page, (p) {
            setState(() => page = p);
            refresh();
          }),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed:
              cart.isNotEmpty && data?['restaurant']['acceptingOrders'] == true
              ? checkout
              : null,
          child: Text('View cart · ${price(subtotal)}'),
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
        const SizedBox(height: 20),
        Glass(
          child: Column(
            children: [
              for (final item in (quote?['snapshot']?['lineItems'] as List? ?? widget.cart))
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${item['name']} × ${item['quantity']}'),
                  trailing: Text(
                    price(((item['unitPrice']??item['price']) as int) * (item['quantity'] as int)),
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
                onPressed: account == null || busy
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
                child: const Text('Change entrance'),
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
        const Glass(
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
        const FilledButton(
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
