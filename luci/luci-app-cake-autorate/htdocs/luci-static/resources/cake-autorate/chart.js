'use strict';
'require baseclass';

/*
 * Pure helpers for the status view's live chart (view/cake-autorate/status.js).
 *
 * The chart is drawn with Apache ECharts, bundled next to this file as
 * echarts.min.js (Apache-2.0, see its header) so it works on a router with no
 * internet access. Unlike the luci-app-statistics graphs it needs no collectd:
 * it is seeded from the rpcd `history` method and then extended with every
 * `status` poll.
 *
 * Same rule as live.js: no _(), no L.*, no DOM at module scope, so the data
 * handling is unit-tested under plain node (tests/chart.test.js). The view owns
 * echarts.init(), resizing and every user-facing string (passed in as labels).
 *
 * rpcd history {instance} -> { instance, points: [[epoch, dl_achieved_kbps,
 *     ul_achieved_kbps, dl_shaper_kbps, ul_shaper_kbps, dl_owd_delta_us,
 *     ul_owd_delta_us], ...] }   oldest first, at most one point per second.
 */

/* Points kept per series: 20 minutes at the 3 s poll, on top of the history. */
var MAX_POINTS = 1200;

var SERIES = ['dlShaper', 'dlAchieved', 'ulShaper', 'ulAchieved', 'dlOwd', 'ulOwd'];

function emptyStore() {
	var s = { lastEpoch: null };
	SERIES.forEach(function (k) { s[k] = []; });
	return s;
}

function finite(v) {
	return typeof v === 'number' && isFinite(v);
}

/*
 * Add one sample. Values in: kbps and microseconds; stored as Mbit/s and ms
 * against a millisecond timestamp, which is what an ECharts time axis takes.
 * A sample that is not newer than the last one is ignored: the status poll
 * runs every 3 s but the daemon stops logging while the link is idle, so the
 * same SUMMARY line is returned over and over.
 */
function pushSample(store, epoch, dlAch, ulAch, dlShaper, ulShaper, dlOwdUs, ulOwdUs) {
	if (!finite(epoch) || (store.lastEpoch !== null && epoch <= store.lastEpoch))
		return false;
	var t = Math.round(epoch * 1000);
	/* null / 1000 is 0 in JS: a missing value must stay a gap, not a zero. */
	function per1000(v) { return finite(v) ? Math.round(v / 10) / 100 : null; }
	var vals = {
		dlShaper: per1000(dlShaper), dlAchieved: per1000(dlAch),
		ulShaper: per1000(ulShaper), ulAchieved: per1000(ulAch),
		dlOwd: per1000(dlOwdUs), ulOwd: per1000(ulOwdUs)
	};
	SERIES.forEach(function (k) {
		store[k].push([t, vals[k]]);
		if (store[k].length > MAX_POINTS)
			store[k].shift();
	});
	store.lastEpoch = epoch;
	return true;
}

/* Seed a store from the rpcd `history` response. Malformed points are skipped. */
function storeFromHistory(resp) {
	var store = emptyStore();
	var pts = (resp && Array.isArray(resp.points)) ? resp.points : [];
	pts.forEach(function (p) {
		if (Array.isArray(p) && p.length >= 7)
			pushSample(store, p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
	});
	return store;
}

/* Extend a store from one row of live.statusRows(). */
function pushStatusRow(store, row) {
	if (!row || !row.available)
		return false;
	return pushSample(store, row.epoch, row.dl_achieved_kbps, row.ul_achieved_kbps,
		row.cake_dl_rate_kbps, row.cake_ul_rate_kbps,
		row.dl_avg_owd_delta_us, row.ul_avg_owd_delta_us);
}

/*
 * ECharts option: rates on top (shaper dashed, achieved solid, download blue,
 * upload orange), OWD deltas below on a shared, zoomable time axis.
 * `labels` carries the translated strings; `dark` picks text/grid colours that
 * stay readable on a dark LuCI theme.
 */
function chartOption(store, labels, dark) {
	var DL = '#1e88e5', UL = '#f57c00';
	var text = dark ? '#ccc' : '#444', grid = dark ? '#444' : '#e5e5e5';
	function line(name, key, color, axis, dashed) {
		return {
			name: name, type: 'line', data: store[key], showSymbol: false,
			xAxisIndex: axis, yAxisIndex: axis, connectNulls: false,
			lineStyle: { width: dashed ? 1.5 : 2, type: dashed ? 'dashed' : 'solid', color: color },
			itemStyle: { color: color }
		};
	}
	function yAxis(idx, name) {
		return {
			gridIndex: idx, type: 'value', name: name, min: 0,
			nameTextStyle: { color: text }, axisLabel: { color: text },
			splitLine: { lineStyle: { color: grid } }
		};
	}
	function xAxis(idx, show) {
		return {
			gridIndex: idx, type: 'time', axisLabel: { show: show, color: text },
			axisLine: { lineStyle: { color: grid } }, splitLine: { show: false }
		};
	}
	return {
		backgroundColor: 'transparent',
		animation: false,
		tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
		axisPointer: { link: [{ xAxisIndex: 'all' }] },
		legend: { top: 0, textStyle: { color: text } },
		grid: [
			{ left: 56, right: 24, top: 36, height: '50%' },
			{ left: 56, right: 24, top: '70%', bottom: 48 }
		],
		xAxis: [xAxis(0, false), xAxis(1, true)],
		yAxis: [yAxis(0, labels.rateAxis), yAxis(1, labels.owdAxis)],
		dataZoom: [
			{ type: 'inside', xAxisIndex: [0, 1] },
			{ type: 'slider', xAxisIndex: [0, 1], bottom: 8, height: 18 }
		],
		series: [
			line(labels.dlShaper, 'dlShaper', DL, 0, true),
			line(labels.dlAchieved, 'dlAchieved', DL, 0, false),
			line(labels.ulShaper, 'ulShaper', UL, 0, true),
			line(labels.ulAchieved, 'ulAchieved', UL, 0, false),
			line(labels.dlOwd, 'dlOwd', DL, 1, false),
			line(labels.ulOwd, 'ulOwd', UL, 1, false)
		]
	};
}

/* Series data only, for a cheap setOption() after each poll. */
function seriesUpdate(store) {
	return { series: SERIES.map(function (k) { return { data: store[k] }; }) };
}

return baseclass.extend({
	MAX_POINTS: MAX_POINTS,
	emptyStore: emptyStore,
	pushSample: pushSample,
	storeFromHistory: storeFromHistory,
	pushStatusRow: pushStatusRow,
	chartOption: chartOption,
	seriesUpdate: seriesUpdate
});
