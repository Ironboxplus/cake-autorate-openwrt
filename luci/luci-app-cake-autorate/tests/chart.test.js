#!/usr/bin/env node
'use strict';

/*
 * Unit tests for htdocs/luci-static/resources/cake-autorate/chart.js -- the data
 * handling behind the status view's ECharts chart: seeding from rpcd `history`,
 * extending from `status` polls without duplicating the idle link's frozen
 * sample, unit conversion and the rolling window. echarts itself and the DOM
 * wiring in status.js are not exercised here.
 *
 * Loaded the same way as live.test.js: the shipped LuCI class file evaluated
 * with a stub baseclass whose extend() returns the plain object.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const modPath = path.join(__dirname, '..', 'htdocs', 'luci-static', 'resources', 'cake-autorate', 'chart.js');

function loadModule() {
	const src = fs.readFileSync(modPath, 'utf8');
	const stubBase = { extend: function (o) { return o; } };
	// eslint-disable-next-line no-new-func
	const factory = new Function('window', 'document', 'L', 'baseclass', src);
	return factory(undefined, undefined, undefined, stubBase);
}

let passed = 0;
function test(name, fn) {
	fn();
	passed++;
	console.log('ok - ' + name);
}

const mod = loadModule();

test('storeFromHistory: converts kbps -> Mbit/s, us -> ms, epoch -> ms', function () {
	const s = mod.storeFromHistory({ points: [[1000, 300000, 50000, 330000, 54000, 1500, 2500]] });
	assert.deepStrictEqual(s.dlAchieved, [[1000000, 300]]);
	assert.deepStrictEqual(s.ulAchieved, [[1000000, 50]]);
	assert.deepStrictEqual(s.dlShaper, [[1000000, 330]]);
	assert.deepStrictEqual(s.ulShaper, [[1000000, 54]]);
	assert.deepStrictEqual(s.dlOwd, [[1000000, 1.5]]);
	assert.deepStrictEqual(s.ulOwd, [[1000000, 2.5]]);
	assert.strictEqual(s.lastEpoch, 1000);
});

test('storeFromHistory: tolerates a missing/garbage response and short points', function () {
	assert.strictEqual(mod.storeFromHistory(null).dlShaper.length, 0);
	assert.strictEqual(mod.storeFromHistory({ points: 'x' }).dlShaper.length, 0);
	assert.strictEqual(mod.storeFromHistory({ points: [[1, 2, 3]] }).dlShaper.length, 0);
});

test('pushStatusRow: appends a newer sample, ignores a repeated or older one', function () {
	const s = mod.storeFromHistory({ points: [[1000, 1, 1, 1, 1, 1, 1]] });
	const row = {
		available: true, epoch: 1003.5,
		dl_achieved_kbps: 2000, ul_achieved_kbps: 1000,
		cake_dl_rate_kbps: 330000, cake_ul_rate_kbps: 54000,
		dl_avg_owd_delta_us: 100, ul_avg_owd_delta_us: 200
	};
	assert.strictEqual(mod.pushStatusRow(s, row), true);
	assert.strictEqual(mod.pushStatusRow(s, row), false, 'idle link: same SUMMARY polled again');
	assert.strictEqual(mod.pushStatusRow(s, Object.assign({}, row, { epoch: 999 })), false);
	assert.strictEqual(s.dlShaper.length, 2);
	assert.deepStrictEqual(s.dlShaper[1], [1003500, 330]);
});

test('pushStatusRow: unavailable rows and non-numeric values', function () {
	const s = mod.emptyStore();
	assert.strictEqual(mod.pushStatusRow(s, { available: false, epoch: 5 }), false);
	assert.strictEqual(mod.pushStatusRow(s, null), false);
	assert.strictEqual(mod.pushStatusRow(s, { available: true, epoch: 5, dl_achieved_kbps: null }), true);
	assert.deepStrictEqual(s.dlAchieved[0], [5000, null], 'gap, not zero');
});

test('rolling window: never more than MAX_POINTS per series', function () {
	const s = mod.emptyStore();
	for (let i = 1; i <= mod.MAX_POINTS + 10; i++)
		mod.pushSample(s, i, 1, 1, 1, 1, 1, 1);
	assert.strictEqual(s.dlShaper.length, mod.MAX_POINTS);
	assert.strictEqual(s.dlShaper[0][0], 11000, 'oldest dropped first');
});

test('chartOption / seriesUpdate: six series bound to the store, labels used', function () {
	const s = mod.storeFromHistory({ points: [[1, 1, 1, 1, 1, 1, 1]] });
	const labels = { rateAxis: 'R', owdAxis: 'O', dlShaper: 'a', dlAchieved: 'b', ulShaper: 'c', ulAchieved: 'd', dlOwd: 'e', ulOwd: 'f' };
	const opt = mod.chartOption(s, labels, false);
	assert.deepStrictEqual(opt.series.map(x => x.name), ['a', 'b', 'c', 'd', 'e', 'f']);
	assert.strictEqual(opt.series[0].data, s.dlShaper);
	assert.deepStrictEqual(opt.series.map(x => x.yAxisIndex), [0, 0, 0, 0, 1, 1]);
	assert.strictEqual(mod.seriesUpdate(s).series[5].data, s.ulOwd);
});

console.log('\n' + passed + ' chart.js tests passed');
