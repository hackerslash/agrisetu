import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:agrisetu_app/main.dart';

void main() {
  testWidgets('AgriSetu app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: AgriSetuApp()),
    );
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
