import 'package:flutter/material.dart';

import 'main.dart' show CanvasPage, Glass, muted;
import 'live_app.dart' show LiveWorkspace, apiBase;
import 'mobile_api.dart';

class DemoJoinPage extends StatefulWidget {
  const DemoJoinPage({super.key});
  @override
  State<DemoJoinPage> createState() => _DemoJoinPageState();
}

class _DemoJoinPageState extends State<DemoJoinPage> {
  final server = TextEditingController(text: apiBase);
  final keyInput = TextEditingController();
  String role = 'customer';
  MobileApi? api;
  Map<String, dynamic>? account;
  String? error;
  bool busy = false;
  @override
  void dispose() {
    server.dispose();
    keyInput.dispose();
    api?.close();
    super.dispose();
  }

  Future<void> join() async {
    setState(() {
      busy = true;
      error = null;
    });
    MobileApi? next;
    try {
      if (!RegExp(r'^igo_demo_[a-f0-9]{64}$').hasMatch(keyInput.text.trim())) {
        throw const ApiFailure(
          'Paste the demo session key from your admin workspace.',
        );
      }
      next = MobileApi.demo(
        baseUrl: server.text.trim(),
        key: keyInput.text.trim(),
        role: role,
      );
      final result = await next.request('account');
      if (result['demo'] != true || result['access']?['role'] != role) {
        throw const ApiFailure(
          'This server did not return a fictional demo account.',
        );
      }
      if (mounted) {
        api?.close();
        setState(() {
          api = next;
          account = result;
        });
      } else {
        next.close();
      }
    } catch (e) {
      next?.close();
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh() async {
    final result = await api!.request('account');
    if (mounted) setState(() => account = result);
  }

  Future<void> leave() async {
    setState(() => account = null);
    api?.close();
    api = null;
  }

  @override
  Widget build(BuildContext context) {
    if (account != null) {
      return LiveWorkspace(
        key: ValueKey(role),
        api: api!,
        account: account!,
        refreshAccount: refresh,
        signOut: leave,
      );
    }
    return CanvasPage(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: busy ? null : () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
            ),
          ),
          Text(
            'Try iGO together.',
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          const SizedBox(height: 12),
          const Glass(
            child: Text(
              'SHARED DEMO · NO REAL PURCHASES\nAsk your admin to create a session in Shared demo. Use the same key on each test phone. All accounts, addresses, orders and bank results in this session are fictional.',
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: server,
            enabled: !busy,
            autocorrect: false,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'iGO server address',
              hintText: 'https://your-igo-app.vercel.app',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: keyInput,
            enabled: !busy,
            autocorrect: false,
            enableSuggestions: false,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Demo session key'),
          ),
          const SizedBox(height: 20),
          const Text(
            'Choose a fictional role',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final r in ['customer', 'restaurant', 'rider'])
                ChoiceChip(
                  label: Text(
                    {
                      'customer': 'Customer',
                      'restaurant': 'Restaurant',
                      'rider': 'Rider',
                    }[r]!,
                  ),
                  selected: role == r,
                  onSelected: busy ? null : (_) => setState(() => role = r),
                ),
            ],
          ),
          const SizedBox(height: 24),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.red)),
          FilledButton(
            onPressed: busy ? null : join,
            child: Text(busy ? 'Joining…' : 'Join shared demo'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Use HTTPS for a phone. Your session key is kept only while this screen is open. This does not create or approve a real account.',
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class DemoBankPage extends StatefulWidget {
  final MobileApi api;
  final Map<String, dynamic> attempt;
  const DemoBankPage({super.key, required this.api, required this.attempt});
  @override
  State<DemoBankPage> createState() => _DemoBankPageState();
}

class _DemoBankPageState extends State<DemoBankPage> {
  Map<String, dynamic>? result;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    if (widget.attempt['status'] != 'Pending') result = widget.attempt;
  }

  Future<void> simulate(String outcome) async {
    if (busy || !widget.api.isDemo) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final value = await widget.api.request(
        'demo-payment',
        data: {'attemptId': widget.attempt['id'], 'outcome': outcome},
      );
      if (value['demo'] != true) {
        throw const ApiFailure('Unexpected demo bank response.');
      }
      if (mounted) setState(() => result = value);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy && result?['status'] != 'Approved',
    child: CanvasPage(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              tooltip: 'Return to cart',
              onPressed: busy || result?['status'] == 'Approved'
                  ? null
                  : () => Navigator.pop(context, result),
              icon: const Icon(Icons.arrow_back),
            ),
          ),
          const SizedBox(height: 24),
          const Icon(Icons.account_balance_outlined, size: 48),
          const SizedBox(height: 16),
          Text(
            'iGO Demo Bank',
            style: Theme.of(context).textTheme.headlineMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'SIMULATION ONLY · NO MONEY MOVES',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          if (error != null) ...[
            const SizedBox(height: 12),
            Text(error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 24),
          Glass(
            child: Column(
              children: [
                Text(
                  'MVR ${((widget.attempt['amount'] as num) / 100).toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Text('Fictional test amount'),
                const SizedBox(height: 12),
                const Text(
                  'No card number, bank account, OTP or payment credentials are needed. This simulator does not connect to BML.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (result == null) ...[
            const Text(
              'Choose a test bank response',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: busy ? null : () => simulate('Approved'),
              child: Text(busy ? 'Simulating…' : 'Simulate approval'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: busy ? null : () => simulate('Declined'),
              child: const Text('Simulate decline'),
            ),
            TextButton(
              onPressed: busy ? null : () => simulate('Cancelled'),
              child: const Text('Cancel demo payment'),
            ),
          ] else ...[
            Glass(
              child: Column(
                children: [
                  Icon(
                    result!['status'] == 'Approved'
                        ? Icons.check_circle_outline
                        : Icons.info_outline,
                    size: 40,
                  ),
                  Text(
                    'Demo payment ${result!['status'].toString().toLowerCase()}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 20,
                    ),
                  ),
                  Text(
                    result!['status'] == 'Approved'
                        ? '${result!['orderId']}\nYour fictional order is now visible to the kitchen and admin.'
                        : 'No order was submitted. No charge was made.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context, result),
              child: Text(
                result!['status'] == 'Approved'
                    ? 'Continue to orders'
                    : 'Return to cart',
              ),
            ),
          ],
          const SizedBox(height: 16),
          const Text(
            'Demo approval is a test result. It is not a receipt for a real purchase.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ],
      ),
    ),
  );
}
