import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Guards the rule MOB-32, MOB-34, MOB-35 and MOB-26 each enforced by hand:
/// a caught exception never becomes text we show someone.
///
/// `FirebaseException.toString()` appends its stack trace, so interpolating a
/// caught error is how `MethodChannel` and `cloud_functions` frames ended up
/// in front of parents. Every catch that has something to say should say it
/// through `presentError`, which classifies the error and never quotes it.
///
/// Logging is exempt: the raw error, stack trace and all, is exactly what a
/// developer wants. Only text that can reach a screen is in scope.
void main() {
  test('no caught exception is interpolated into shown text (MOB-26)', () {
    final findings = <_Finding>[];
    for (final file in _dartSources(Directory('lib'))) {
      findings.addAll(_scan(file));
    }

    expect(
      findings,
      isEmpty,
      reason: 'A caught error is being turned into text at:\n'
          '${findings.map((f) => '  $f').join('\n')}\n\n'
          'Use presentError(error, action: ...) from '
          'lib/src/utils/error_presenter.dart. It returns a sentence that is '
          'safe to show and logs the original for you. To log an error and '
          'nothing else, call logHandledError.',
    );
  });

  test('the guard notices a leak that is not a log line', () {
    // Without this the suite above could pass by scanning nothing, or by
    // blanking so much source that a real leak is invisible.
    const leaky = '''
void f() {
  try {
    g();
  } catch (error) {
    debugPrint('fine, this is a log: \$error');
    setState(() => _message = 'It failed: \$error');
  }
}
''';
    final found = _findLeaks(leaky, 'memory.dart');
    expect(found, hasLength(1));
    expect(found.single.line, 6);
  });

  test('the guard does not flag a logged error or a presented one', () {
    const clean = '''
void f() {
  try {
    g();
  } catch (error, stackTrace) {
    debugPrint(
      '[thing] it failed while loading: \$error',
    );
    logHandledError(error, whileTryingTo: 'load', stackTrace: stackTrace);
    _message = presentError(error, action: 'load this').message;
  }
}
''';
    expect(_findLeaks(clean, 'memory.dart'), isEmpty);
  });
}

Iterable<File> _dartSources(Directory root) sync* {
  for (final entity in root.listSync(recursive: true)) {
    if (entity is File && entity.path.endsWith('.dart')) yield entity;
  }
}

List<_Finding> _scan(File file) =>
    _findLeaks(file.readAsStringSync(), file.path);

/// Calls whose arguments go to a developer, never to a screen.
const _loggingCalls = {'debugPrint', 'print', 'log', 'logHandledError'};

final _catchClause =
    RegExp(r'catch\s*\(\s*([A-Za-z_]\w*)\s*(?:,\s*([A-Za-z_]\w*)\s*)?\)');

List<_Finding> _findLeaks(String source, String path) {
  final scan = _Source(source);
  final code = scan.withoutCommentsOrLogging(_loggingCalls);
  final findings = <_Finding>[];

  var depth = 0;
  final open = <_CatchScope>[];
  _CatchScope? armed;

  var index = 0;
  while (index < code.length) {
    if (scan.isInString(index)) {
      index++;
      continue;
    }

    final match = _catchClause.matchAsPrefix(code, index);
    if (match != null) {
      armed = _CatchScope(match.group(1)!, match.group(2), 0);
      index = match.end;
      continue;
    }

    final ch = code[index];
    if (ch == '{') {
      depth++;
      if (armed != null) {
        open.add(armed.atDepth(depth));
        armed = null;
      }
    } else if (ch == '}') {
      open.removeWhere((scope) => scope.depth == depth);
      depth--;
    }
    index++;
  }

  // Second pass: with the scopes known, look inside them for the error being
  // interpolated. Done separately so a leak anywhere in the block is caught,
  // not only after the brace that opened it.
  for (final scope in _scopesOf(code, scan)) {
    for (final name in [scope.name, if (scope.trace != null) scope.trace!]) {
      for (final use in _interpolations(name).allMatches(code)) {
        if (use.start < scope.start || use.start >= scope.end) continue;
        if (!scan.isInString(use.start) && !_isToStringUse(code, use)) continue;
        findings.add(_Finding(path, scan.lineAt(use.start), name));
      }
    }
  }

  return findings;
}

/// `$name`, `${name...}` and `name.toString()` — the shapes that put an
/// exception's own words into a string.
RegExp _interpolations(String name) =>
    RegExp(r'\$\{?\s*' + name + r'\b|\b' + name + r'\.toString\(\)');

bool _isToStringUse(String code, Match match) =>
    match.group(0)!.endsWith('.toString()');

List<_CatchScope> _scopesOf(String code, _Source scan) {
  final scopes = <_CatchScope>[];
  for (final match in _catchClause.allMatches(code)) {
    if (scan.isInString(match.start)) continue;
    final brace = code.indexOf('{', match.end);
    if (brace == -1) continue;
    final end = _matchingBrace(code, brace, scan);
    if (end == -1) continue;
    scopes.add(
      _CatchScope(match.group(1)!, match.group(2), 0)
        ..start = brace
        ..end = end,
    );
  }
  return scopes;
}

int _matchingBrace(String code, int open, _Source scan) {
  var depth = 0;
  for (var i = open; i < code.length; i++) {
    if (scan.isInString(i)) continue;
    if (code[i] == '{') {
      depth++;
    } else if (code[i] == '}') {
      depth--;
      if (depth == 0) return i;
    }
  }
  return -1;
}

class _CatchScope {
  final String name;
  final String? trace;
  final int depth;
  int start = 0;
  int end = 0;

  _CatchScope(this.name, this.trace, this.depth);

  _CatchScope atDepth(int value) => _CatchScope(name, trace, value);
}

class _Finding {
  final String path;
  final int line;
  final String name;

  const _Finding(this.path, this.line, this.name);

  @override
  String toString() => '$path:$line ($name)';
}

/// Knows which characters of a Dart source sit inside a string literal, so
/// braces and parentheses in prose are not mistaken for code.
class _Source {
  final String text;
  late final List<bool> _inString = _markStrings();
  late final List<int> _lineStarts = _markLines();

  _Source(this.text);

  bool isInString(int index) => index < _inString.length && _inString[index];

  int lineAt(int index) {
    var low = 0;
    var high = _lineStarts.length - 1;
    while (low < high) {
      final mid = (low + high + 1) ~/ 2;
      if (_lineStarts[mid] <= index) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low + 1;
  }

  /// The source with comments and logging calls blanked to spaces. Newlines
  /// survive so reported line numbers still point at the real file.
  String withoutCommentsOrLogging(Set<String> calls) {
    final out = List<String>.from(text.split(''));

    // Comments first: a `//` inside a string is not one, which _inString knows.
    var i = 0;
    while (i < text.length - 1) {
      if (!isInString(i) && text[i] == '/' && text[i + 1] == '/') {
        while (i < text.length && text[i] != '\n') {
          out[i] = ' ';
          i++;
        }
      } else if (!isInString(i) && text[i] == '/' && text[i + 1] == '*') {
        final end = text.indexOf('*/', i + 2);
        final stop = end == -1 ? text.length : end + 2;
        for (var j = i; j < stop; j++) {
          if (out[j] != '\n') out[j] = ' ';
        }
        i = stop;
      } else {
        i++;
      }
    }

    final callPattern = RegExp(r'\b(' + calls.join('|') + r')\s*\(');
    for (final match in callPattern.allMatches(text)) {
      if (isInString(match.start)) continue;
      final close = _matchingParen(match.end - 1);
      if (close == -1) continue;
      for (var j = match.start; j <= close; j++) {
        if (out[j] != '\n') out[j] = ' ';
      }
    }

    return out.join();
  }

  int _matchingParen(int open) {
    var depth = 0;
    for (var i = open; i < text.length; i++) {
      if (isInString(i)) continue;
      if (text[i] == '(') {
        depth++;
      } else if (text[i] == ')') {
        depth--;
        if (depth == 0) return i;
      }
    }
    return -1;
  }

  List<bool> _markStrings() {
    final marks = List<bool>.filled(text.length, false);
    var i = 0;
    while (i < text.length) {
      final ch = text[i];

      // Skip comments so a quote in prose does not open a string.
      if (ch == '/' && i + 1 < text.length && text[i + 1] == '/') {
        while (i < text.length && text[i] != '\n') {
          i++;
        }
        continue;
      }
      if (ch == '/' && i + 1 < text.length && text[i + 1] == '*') {
        final end = text.indexOf('*/', i + 2);
        i = end == -1 ? text.length : end + 2;
        continue;
      }

      if (ch != "'" && ch != '"') {
        i++;
        continue;
      }

      final quote = ch;
      final triple = text.startsWith(quote * 3, i);
      final delimiter = triple ? quote * 3 : quote;
      final raw = i > 0 && text[i - 1] == 'r';
      var j = i + delimiter.length;

      while (j < text.length) {
        if (!raw && text[j] == r'\') {
          j += 2;
          continue;
        }
        if (text.startsWith(delimiter, j)) break;
        if (!triple && text[j] == '\n') break;
        j++;
      }

      final stop = (j < text.length ? j + delimiter.length : text.length)
          .clamp(0, text.length);
      for (var k = i; k < stop; k++) {
        marks[k] = true;
      }
      i = stop;
    }
    return marks;
  }

  List<int> _markLines() {
    final starts = <int>[0];
    for (var i = 0; i < text.length; i++) {
      if (text[i] == '\n') starts.add(i + 1);
    }
    return starts;
  }
}
