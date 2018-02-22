PATH := node_modules/.bin:$(PATH)

.PHONY: test lint ts clean

test: test/test.js test/test.dll lint
	mocha

test/test.dll: test/test.cs
	csc /target:library /out:$@ $<

lint: ts
	tslint -t verbose -p tsconfig.json

ts:
	tsc

clean:
	rimraf dist

clean-all: clean
	rimraf test/test.dll
