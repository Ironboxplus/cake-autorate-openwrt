# luci-app-cake-autorate-external -- the live status view (and its rpcd
# backend) for a cake-autorate that this feed does NOT manage: upstream's manual
# install in /root/cake-autorate, started by its own launcher.sh and configured
# by something else (on the campus router, the multidial daemon writes the
# /etc/config/cake-autorate sections). Built as an .ipk from the OpenWrt 24.10
# SDK by .github/workflows/build-external.yml.
#
# It ships no copy of anything: status.js, its helpers, ECharts and the rpcd
# backend are installed straight from luci-app-cake-autorate and
# net/cake-autorate, so the two variants cannot drift apart. What it leaves out
# is the configuration page and the bridge -- that daemon's UCI keys are written
# by its owner, and the form here targets the bridge's option schema.
#
# It cannot sit beside the full packages: it installs the same rpcd object and
# view paths.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cake-autorate-external
PKG_VERSION:=0.2.6
PKG_RELEASE:=1
PKG_MAINTAINER:=Ironboxplus
PKG_LICENSE:=GPL-2.0-or-later

include $(INCLUDE_DIR)/package.mk

APP_DIR:=$(CURDIR)/../luci-app-cake-autorate
RES_DIR:=$(APP_DIR)/htdocs/luci-static/resources
RPCD_SRC:=$(CURDIR)/../../net/cake-autorate/files/cake-autorate.rpcd

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI status view for an externally managed cake-autorate
  DEPENDS:=+luci-base +rpcd +jsonfilter
  CONFLICTS:=luci-app-cake-autorate cake-autorate
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
  Live status, per-instance charts and service control for a cake-autorate
  daemon installed outside this feed (upstream's /root/cake-autorate checkout).
  Reads /var/log/cake-autorate.<instance>.log; the daemon must run with
  output_summary_stats=1 for the view to have data.
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/cake-autorate
	$(INSTALL_DATA) $(RES_DIR)/cake-autorate/chart.js $(1)/www/luci-static/resources/cake-autorate/
	$(INSTALL_DATA) $(RES_DIR)/cake-autorate/live.js $(1)/www/luci-static/resources/cake-autorate/
	$(INSTALL_DATA) $(RES_DIR)/cake-autorate/echarts.min.js $(1)/www/luci-static/resources/cake-autorate/
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/cake-autorate
	$(INSTALL_DATA) $(RES_DIR)/view/cake-autorate/status.js $(1)/www/luci-static/resources/view/cake-autorate/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) $(RPCD_SRC) $(1)/usr/libexec/rpcd/cake-autorate
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/$(PKG_NAME).json $(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/$(PKG_NAME).json $(1)/usr/share/rpcd/acl.d/
endef

# rpcd only enumerates /usr/libexec/rpcd/* and acl.d at start; reload (never
# restart: that logs everyone out) and evict LuCI's menu cache, or the menu
# entry stays invisible until the next reboot. See AGENTS.md.
define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache/
/etc/init.d/rpcd reload
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.*
rm -rf /tmp/luci-modulecache/
/etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
