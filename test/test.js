"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const testClass = { assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test" };
const dotnet =
{
	parse: edge.func({ ...testClass, methodName: "Parse" }),
	match: edge.func({ ...testClass, methodName: "Match" }),
	matches: edge.func({ ...testClass, methodName: "Matches" }),
};
// Pre-load the CLR to avoid affecting first test performance.
dotnet.parse({ regex: "" }, true);

const assert = require("assert");
suite("regex engine", () =>
{
	suite("basics", () =>
	{
		testMatches("literal text", "abb", "ababbb");
		testMatches("failed match", "a", "b");
		testMatches("dot - .", ".*", "abc\r\n");
		testMatches("alternation - |", "a*|b", "aabba");
	});

	suite("escape sequences", () =>
	{
		testMatches("literal - \\", "a\\+", "aaa+");
		testParseError("invalid sequence", "\\q");
		testMatches("digit - \\d", "\\d+", "abc1234567890def");
		testMatches("non-digit - \\D", "\\D+", "abc1234567890def");
		testMatches("word character - \\w", "\\w+", "(a_123)");
		testMatches("non-word character - \\W", "\\W+", "(a_123)");
		testMatches("whitespace - \\s", "\\s+", "a\r \nb");
		testMatches("non-whitespace - \\S", "\\S+", "a\r \nb");
		testMatches("tab - \\t", "\\t+", "\ta");
		testMatches("carriage return - \\r", "\\r+", "\ra");
		testMatches("newline - \\n", "\\n+", "\na");
		testMatches("alert - \\a", "\\a+", "\x07a");
		testMatches("escape - \\e", "\\e+", "\x1Ba");
		testMatches("form feed - \\f", "\\f+", "\fa");
		testMatches("vertical tab - \\v", "\\v+", "\va");
		testMatches("control character - \\c", "\\cJ+", "\na");
		testMatches("hex - \\x", "\\x61\\x5F", "a_a");
		testMatches("unicode hex - \\u", "\\u0061\\u2081", "a₁a");
	});

	suite("repetition", () =>
	{
		testMatches("zero or one - ?", "ab?c?a?", "aba");
		testMatches("zero or more - *", "b*a*", "aabbb");
		testMatches("one or more - +", "b+", "aabbb");
		testParseError("invalid character - ?", "?a");
		testParseError("invalid character - *", "*a");
		testParseError("invalid character - +", "+a");

		suite("limited", () =>
		{
			testMatches("exact count - {n}", "a{2}", "abaaaaa");
			testMatches("minimum count - {n,}", "a{2,}", "abaaaaa");
			testMatches("range count - {n,m}", "a{2,3}", "abaaaaa");
			testMatches("literal if incorrect format", "a{-2,3}", "aaa{-2,3}");
			testParseError("invalid position", "a*{2,3}");
		});

		suite("lazy", () =>
		{
			testMatches("lazy zero or one - ??", "ab??", "ab");
			testMatches("lazy zero or more - *?", "a*?b*?", "aabbb");
			testMatches("lazy one or more - +?", "a+?b+?", "aabbb");
			testMatches("lazy range - {n,m}?", "a{2,3}?", "abaaaaa");
		});
	});

	suite("groups", () =>
	{
		testMatches("non-capturing - (?:)", "a(?:b(?:c)?)*", "abbccb");
		testParseError("mismatched parentheses - (", "(a");
		testParseError("mismatched parentheses - )", ")a");
		testMatches("alternation - |", "(a*|b)*", "aabba");

		suite("capturing", () =>
		{
			testMatches("captured - ()", "(a(b)*)*(b)", "aabbbaab");
			testMatches("named - (?<>)", "(?<A>a)+(b)", "aab");
			testMatches("named - (?'')", "(?'A'a)+(b)", "aab");
			testMatches("numbered", "(?<3>a)+(b)", "aab");
			testMatches("duplicate names", "(?<A>a)+(?<A>b)", "aab");
			testMatches("duplicate numbers", "(a)+(?<1>b)", "aab");
			testMatches("case sensitive names", "(?<A>a)+(?<a>b)", "aab");
			testParseError("invalid names", "(?<1a>)");
			testParse("underscored names", "(?<_1a>)");
			testParseError("invalid zero", "(?<0>)");
		});
	});

	suite("character classes", () =>
	{
		testMatches("inclusive - []", "[a-z0]+", "123abc0123");
		testMatches("exclusive - [^]", "[^a-z0]+", "123abc0123");
		testParseError("mismatched brackets - [", "[");
		testParse("mismatched brackets - ]", "]");
		testMatches("literal hyphens - -", "[a-]+", "a-z");
		testMatches("subtraction - -[]", "[a-z-[ad]]+", "abcdef");

		suite("escape sequences", () =>
		{
			testMatches("literal - \\", "[[\\]a]+", "ab][[]ab");
			testParseError("invalid sequence", "[\\q]");
			testMatches("digit - \\d", "[\\d]+", "abc1234567890def");
			testMatches("non-digit - \\D", "[\\D]+", "abc1234567890def");
			testMatches("word character - \\w", "[\\w]+", "(a_123)");
			testMatches("non-word character - \\W", "[\\W]+", "(a_123)");
			testMatches("whitespace - \\s", "[\\s]+", "a\r \nb");
			testMatches("non-whitespace - \\S", "[\\S]+", "a\r \nb");
			testMatches("tab - \\t", "[\\t]+", "\ta");
			testMatches("carriage return - \\r", "[\\r]+", "\ra");
			testMatches("newline - \\n", "[\\n]+", "\na");
			testMatches("alert - \\a", "[\\a]+", "\x07a");
			testMatches("backspace - \\b", "[\\b]+", "\ba");
			testMatches("escape - \\e", "[\\e]+", "\x1Ba");
			testMatches("form feed - \\f", "[\\f]+", "\fa");
			testMatches("vertical tab - \\v", "[\\v]+", "\va");
			testMatches("control character - \\c", "[\\cJ]+", "\na");
			testMatches("hex - \\x", "[\\x61\\x5F]+", "a_a");
			testMatches("unicode hex - \\u", "[\\u0061\\u2081]+", "a₁a");
		});
	});

	suite("flags", () =>
	{
		testMatches("case sensitivity", "a", "Aa");
		testMatches("case insensitivity", "a", "Aa", { flags: "i" });
		testMatches("non-single-line mode", ".*", "a\r\nb\r\nc");
		testMatches("single-line mode", ".*", "a\r\nb\r\nc", { flags: "s" });

		suite("inline", () =>
		{
			testMatches("inline - (?)", "a(?i)a*(?i-i)a", "AaAaA");
			testMatches("inline at end of sequence", "a(?i)", "AaAaA");
			testMatches("scoped inline - (?)", "(?:a(?i)a*)a", "AaAaA");
			testMatches("scoped - (?:)", "a(?i:a*)a", "AaAaA");
			testParseError("invalid flag", "(?a)");
			testParseError("missing flags", "(?)");
		});
	});
});

suite("API", () =>
{
	suite("Regex", () =>
	{
		suite("constructor()", () =>
		{
			test("parse", () =>
			{
				assert.doesNotThrow(() => new ncre.Regex("a"));
			});
		});
		suite("match()", () =>
		{
			test("success", () =>
			{
				const match = new ncre.Regex("a").match("a");
				assert.ok(match);
				assert.strictEqual(match.success, true);
			});
			test("failure", () =>
			{
				const match = new ncre.Regex("a").match("b");
				assert.ok(match);
				assert.strictEqual(match.success, false);
			});
		});
		suite("matches()", () =>
		{
			test("success", () =>
			{
				const matches = new ncre.Regex("a").matches("a");
				assert.ok(matches);
				assert.strictEqual(matches.length, 1);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].success, true);
			});
			test("failure", () =>
			{
				const matches = new ncre.Regex("a").matches("b");
				assert.ok(matches);
				assert.strictEqual(matches.length, 0);
			});
			test("multiple matches", () =>
			{
				const matches = new ncre.Regex("[ab]").matches("aba");
				assert.ok(matches);
				assert.strictEqual(matches.length, 3);
				for (let i = 0; i < matches.length; i++)
				{
					const match = matches[i];
					assert.ok(match);
					assert.strictEqual(match.success, true);
					assert.strictEqual(match.index, i);
					assert.strictEqual(match.value, i === 1 ? "b" : "a");
				}
			});
			test("empty matches", () =>
			{
				const matches = new ncre.Regex("a*").matches("aabca");
				assert.ok(matches);
				assert.strictEqual(matches.length, 5);
				assert.ok(matches[0]);
				assert.strictEqual(matches[0].success, true);
				assert.strictEqual(matches[0].index, 0);
				assert.strictEqual(matches[0].value, "aa");
				assert.ok(matches[1]);
				assert.strictEqual(matches[1].success, true);
				assert.strictEqual(matches[1].index, 2);
				assert.strictEqual(matches[1].value, "");
				assert.ok(matches[2]);
				assert.strictEqual(matches[2].success, true);
				assert.strictEqual(matches[2].index, 3);
				assert.strictEqual(matches[2].value, "");
				assert.ok(matches[3]);
				assert.strictEqual(matches[3].success, true);
				assert.strictEqual(matches[3].index, 4);
				assert.strictEqual(matches[3].value, "a");
				assert.ok(matches[4]);
				assert.strictEqual(matches[4].success, true);
				assert.strictEqual(matches[4].index, 5);
				assert.strictEqual(matches[4].value, "");
			});
		});
	});

	suite("Match", () =>
	{
		test("captures", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.ok(match.captures);
			assert.strictEqual(match.captures.length, 1);
		});
		test("name", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.name, "0");
		});
		test("success", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.success, true);
		});
		test("index", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.index, 3);
		});
		test("length", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.length, 2);
		});
		test("value", () =>
		{
			const match = new ncre.Regex("de").match("abcde");
			assert.ok(match);
			assert.strictEqual(match.value, "de");
		});
		suite("group()", () =>
		{
			test("numbered groups", () =>
			{
				const match = new ncre.Regex("(a+)b+(b+)?").match("aaabbb");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.ok(match.group(1));
				assert.ok(match.group(2));
				assert.strictEqual(match.group(1).success, true);
				assert.strictEqual(match.group(2).success, false);
			});
			test("named groups", () =>
			{
				const match = new ncre.Regex("(a+)b+(?<A>b+)?").match("aaabbb");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.ok(match.group("1"));
				assert.ok(match.group("A"));
				assert.strictEqual(match.group("1").success, true);
				assert.strictEqual(match.group("A").success, false);
			});
			test("nonexistent numbered groups", () =>
			{
				const match = new ncre.Regex("a(b)").match("ab");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.strictEqual(match.group(2), undefined);
			});
			test("nonexistent named groups", () =>
			{
				const match = new ncre.Regex("a(?<A>b)").match("ab");
				assert.ok(match);
				assert.strictEqual(match.success, true);
				assert.strictEqual(match.group("B"), undefined);
			});
		});
	});
});

function testParse(feature, regex, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.doesNotThrow(() => new ncre.Regex(regex), "NCRE parsing threw an error.");
		assert.doesNotThrow(() => dotnet.parse({ regex, options }), ".NET parsing threw an error.");
	});
}

function testParseError(feature, regex, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		assert.throws(() => new ncre.Regex(regex), "NCRE parsing did not throw an error.");
		assert.throws(() => dotnet.parse({ regex, options }), ".NET parsing did not throw an error.");
	});
}

function testMatches(feature, regex, input, options, only)
{
	(only ? test.only : test)(feature, () =>
	{
		const actual = new ncre.Regex(regex, options).matches(input);
		const expected = dotnet.matches({ regex, input, options }, true);
		// Edge deserializes Match.groups as an array, so convert it to a Map.
		expected.forEach(m => m.groups = new Map(m.groups.map(g => [g.name, g])));
		assert.deepEqual(actual, expected, "Matches are not equal.")
	});
}
