# nss-shaper.sh -- drive Qualcomm NSS hardware shapers instead of CAKE.
# Installed to /usr/lib/cake-autorate/nss-shaper.sh and sourced at the END of a
# generated instance config when that instance sets `option shaper_backend 'nss'`
# (see cake-autorate-bridge.sh).
#
# On IPQ807x/IPQ60xx builds with NSS offload, sqm-scripts' nss-zk.qos script
# shapes in the NSS firmware with an nsstbl -> nssprio -> {nsstbl, nsstbl,
# nssfq_codel} tree on the egress device and on its ifb@<iface> ingress device.
# There is no CAKE qdisc to `tc qdisc change ... cake bandwidth`, so this file
# redefines the daemon's set_shaper_rate() to rewrite the nsstbl rates instead.
# Sourcing it from the config works because the daemon sources its config after
# lib.sh/defaults.sh but before it calls set_shaper_rate().
#
# The handles match nss-zk.qos: root 1: is the shaper, 100: and 200: are the
# priority bands whose rates nss-zk.qos derives as 1/10 and 4/10 of the root.
# nsstbl rejects a burst smaller than one MTU-sized frame, hence the clamps.
# Everything except the tc calls is upstream v3.2.2 set_shaper_rate() verbatim.

nss_set_rate() {
	local dev=$1 rate=$2 mtu burst burst100 burst200
	read -r mtu < "/sys/class/net/$dev/mtu"
	mtu=$((mtu + 18)) # Match nss-zk Ethernet/NSS overhead; child MTU is at least 1514.
	burst=$(( ((rate / 8 + mtu / 2) / mtu) * mtu ))
	((burst < mtu)) && burst=$mtu
	burst100=$((burst / 10)); ((burst100 < mtu)) && burst100=$mtu
	burst200=$((burst * 3 / 10)); ((burst200 < mtu)) && burst200=$mtu
	tc qdisc change dev "$dev" root handle 1: nsstbl rate "${rate}kbit" burst "$burst" mtu "$mtu" accel_mode 0 || return 1
	tc qdisc change dev "$dev" parent 10:1 handle 100: nsstbl rate "$((rate / 10))kbit" burst "$burst100" accel_mode 0 || return 1
	tc qdisc change dev "$dev" parent 10:2 handle 200: nsstbl rate "$((rate * 4 / 10))kbit" burst "$burst200" accel_mode 0 || return 1
}

set_shaper_rate()
{
	# Fire up tc and update max_wire_packet_compensation if there are rates to change for the given direction

	local direction=${1} # 'dl' or 'ul'

	(( shaper_rate_kbps[${direction}] != last_shaper_rate_kbps[${direction}] )) || return

	((output_cake_changes)) && log_msg "SHAPER" "NSS nsstbl ${interface[${direction}]} rate ${shaper_rate_kbps[${direction}]}Kbit"

	if ((adjust_shaper_rate[${direction}]))
	then
		nss_set_rate "${interface[${direction}]}" "${shaper_rate_kbps[${direction}]}" || { log_msg "ERROR" "NSS rate update failed"; return 1; }
	else
		((output_cake_changes)) && log_msg "DEBUG" "adjust_${direction}_shaper_rate set to 0 in config, so skipping the corresponding tc qdisc change call."
	fi

	# Compensate for delays imposed by active traffic shaper
	# This will serve to increase the delay thr at rates below around 12Mbit/s
	((
		dl_compensation_us=(1000*dl_max_wire_packet_size_bits)/shaper_rate_kbps[dl],
		ul_compensation_us=(1000*ul_max_wire_packet_size_bits)/shaper_rate_kbps[ul],

		compensated_owd_delta_thr_us[dl]=dl_owd_delta_thr_us + dl_compensation_us,
		compensated_owd_delta_thr_us[ul]=ul_owd_delta_thr_us + ul_compensation_us,

		compensated_avg_owd_delta_thr_us[dl]=dl_avg_owd_delta_thr_us + dl_compensation_us,
		compensated_avg_owd_delta_thr_us[ul]=ul_avg_owd_delta_thr_us + ul_compensation_us,

		max_wire_packet_rtt_us=(1000*dl_max_wire_packet_size_bits)/shaper_rate_kbps[dl] + (1000*ul_max_wire_packet_size_bits)/shaper_rate_kbps[ul],

		last_shaper_rate_kbps[${direction}]=${shaper_rate_kbps[${direction}]}
	))
}
