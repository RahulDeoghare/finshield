import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finshield/main.dart';

void main() {
  // The full HomeShell touches platform plugins (SMS/notifications/prefs) in
  // initState, which aren't available in the unit-test harness — so the smoke
  // test renders the ScanScreen directly.
  testWidgets('Scan screen renders input and example chips', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ScanScreen())));
    await tester.pump();
    expect(find.byType(TextField), findsOneWidget);
    expect(find.text('Scan'), findsOneWidget);
    expect(find.text('Try an example'), findsOneWidget);
  });
}
