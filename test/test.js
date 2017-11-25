"use strict";

const ncre = require("../dist/ncre.js");
const edge = require("edge-js");
const testClass = { assemblyFile: require("path").join(__dirname, "test.dll"), typeName: "Ncre.Test" };
const dotnet =
{
	parse: edge.func({ ...testClass, methodName: "Parse" }),
	match: edge.func({ ...testClass, methodName: "Match" })
};
// Pre-load the CLR to avoid affecting first test performance.
dotnet.parse({ regex: "" }, true);

const assert = require("assert");
describe("Regex", () =>
{
	describe("constructor()", () =>
	{
		testParseError("invalid optional - ?", "?a");
		testParseError("invalid repetition - *", "*a");
		testParseError("invalid repetition - +", "+a");
		testParseError("mismatched parentheses - (", "(a");
		testParseError("mismatched parentheses - )", ")a");
		testParseError("invalid group name", "(?<1a>)");
		testParse("underscored group name", "(?<_1a>)");
		testParseError("zero group number", "(?<0>)");
		testParseError("invalid regex flag", "(?a)");
		testParseError("missing regex flags", "(?)");
	});
	describe("match()", () =>
	{
		testMatch("failed match", "a", "b");
		testMatch("literal text", "abb", "ababbb");
		testMatch("optional - ?", "ab?c?a?", "aba");
		testMatch("repetition - *", "b*a*", "aabbb");
		testMatch("repetition - +", "b+", "aabbb");
		testMatch("lazy optional - ??", "ab??", "ab");
		testMatch("lazy repetition - *?", "a*?b*?", "aabbb");
		testMatch("lazy repetition - +?", "a+?b+?", "aabbb");
		testMatch("non-capturing groups - (?:)", "a(?:b(?:c)?)*", "abbccb");
		testMatch("escaping - \\", "a\\+", "aaa+");
		testMatch("capturing groups - ()", "(a(b)*)*(b)", "aabbbaab");
		testMatch("named capturing groups - (?<>)", "(?<A>a)+(b)", "aab");
		testMatch("named capturing groups - (?'')", "(?'A'a)+(b)", "aab");
		testMatch("duplicate named capturing groups", "(?<A>a)+(?<A>b)", "aab");
		testMatch("case sensitive named capturing groups", "(?<A>a)+(?<a>b)", "aab");
		testMatch("numbered capturing groups", "(?<3>a)+(b)", "aab");
		testMatch("duplicate numbered capturing groups", "(a)+(?<1>b)", "aab");
		testMatch("inline flags - (?)", "a(?i)a*(?i-i)a", "AaAaA");
		testMatch("scoped inline flags - (?)", "(?:a(?i)a*)a", "AaAaA");
		testMatch("scoped flags - (?:)", "a(?i:a*)a", "AaAaA");
		testMatch("case sensitivity", "a", "Aa");
		testMatch("case insensitivity", "a", "Aa", { flags: "i" });
	});
});

describe("Match", () =>
{
	describe("group()", () =>
	{
		it("numbered groups", () =>
		{
			const match = new ncre.Regex("(a+)b+(b+)?").match("aaabbb");
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.ok(match.group(1));
			assert.ok(match.group(2));
			assert.strictEqual(match.group(1).success, true);
			assert.strictEqual(match.group(2).success, false);
		});
		it("named groups", () =>
		{
			const match = new ncre.Regex("(a+)b+(?<A>b+)?").match("aaabbb");
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.ok(match.group("1"));
			assert.ok(match.group("A"));
			assert.strictEqual(match.group("1").success, true);
			assert.strictEqual(match.group("A").success, false);
		});
		it("nonexistent numbered groups", () =>
		{
			const match = new ncre.Regex("a(b)").match("ab");
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.group(2), undefined);
		});
		it("nonexistent named groups", () =>
		{
			const match = new ncre.Regex("a(?<A>b)").match("ab");
			assert.ok(match);
			assert.strictEqual(match.success, true);
			assert.strictEqual(match.group("B"), undefined);
		});
	});
});

function testParse(feature, regex, only)
{
	(only ? it.only : it)(feature, () =>
	{
		assert.doesNotThrow(() => new ncre.Regex(regex), "NCRE parsing threw an error.");
		assert.doesNotThrow(() => dotnet.parse({ regex }), ".NET parsing threw an error.");
	});
}

function testParseError(feature, regex, only)
{
	(only ? it.only : it)(feature, () =>
	{
		assert.throws(() => new ncre.Regex(regex), "NCRE parsing did not throw an error.");
		assert.throws(() => dotnet.parse({ regex }), ".NET parsing did not throw an error.");
	});
}

function testMatch(feature, regex, input, options, only)
{
	options = options || {};
	(only ? it.only : it)(feature, () =>
	{
		const actual = new ncre.Regex(regex, options).match(input);
		const expected = dotnet.match({ regex, input, options }, true);
		// Edge deserializes an array, so convert it to a Map.
		expected.groups = new Map(expected.groups.map(g => [g.name, g]));
		assert.deepEqual(actual, expected, "Matches are not equal.")
	});
}
