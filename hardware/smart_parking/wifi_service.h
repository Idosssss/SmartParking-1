// wifi_service.h - optional WiFi: a small status web page, a JSON endpoint and over-the-air updates.
//
// Everything here is switched off by ENABLE_WIFI in config.h. When it is on:
//   http://<device>.local/         a status page that refreshes itself
//   http://<device>.local/status   the latest status line as JSON (same fields as the USB frames)
//   Arduino IDE -> Tools -> Port   the board also shows up as a network port for OTA uploads
//
// The node never waits for WiFi. If the network is gone it keeps measuring, keeps the
// LEDs right ("offline mode") and tries to reconnect every WIFI_RETRY_MS.
#pragma once

#include <cstdint>
#include <cstring>

#include "config.h"

#if ENABLE_WIFI

#if !__has_include("secrets.h")
#error "ENABLE_WIFI is on but secrets.h is missing. Copy secrets.h.example to secrets.h and fill it in."
#endif

#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>

#include "secrets.h"

class WifiService {
 public:
  void begin() {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(DEVICE_HOSTNAME);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastTryMs_ = millis();
  }

  void setStatusLine(const char* json) {
    std::strncpy(statusLine_, json, sizeof(statusLine_) - 1);
    statusLine_[sizeof(statusLine_) - 1] = '\0';
  }

  void update(uint32_t nowMs) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!servicesStarted_) startServices();
      server_.handleClient();
      ArduinoOTA.handle();
      return;
    }
    if (nowMs - lastTryMs_ >= WIFI_RETRY_MS) {
      lastTryMs_ = nowMs;
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }

  const char* state() const { return WiFi.status() == WL_CONNECTED ? "online" : "offline"; }

 private:
  void startServices() {
    servicesStarted_ = true;
    MDNS.begin(DEVICE_HOSTNAME);
    ArduinoOTA.setHostname(DEVICE_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.begin();
    server_.on("/status", [this]() {
      server_.sendHeader("Access-Control-Allow-Origin", "*");
      server_.send(200, "application/json", statusLine_);
    });
    server_.on("/", [this]() { server_.send(200, "text/html", kPage); });
    server_.begin();
  }

  static constexpr const char* kPage =
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
      "<title>Smart Parking node</title><body style='font:16px system-ui;margin:2rem'>"
      "<h1>Smart Parking node</h1><pre id=s>loading...</pre>"
      "<script>async function t(){try{const r=await fetch('/status');"
      "document.getElementById('s').textContent=JSON.stringify(await r.json(),null,2)}catch(e){}}"
      "t();setInterval(t,1000)</script>";

  WebServer server_{HTTP_PORT};
  char statusLine_[320] = "{}";
  uint32_t lastTryMs_ = 0;
  bool servicesStarted_ = false;
};

#else  // WiFi switched off: same interface, does nothing

class WifiService {
 public:
  void begin() {}
  void setStatusLine(const char*) {}
  void update(uint32_t) {}
  const char* state() const { return "off"; }
};

#endif
