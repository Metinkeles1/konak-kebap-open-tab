"use client";

// "Telefona yükle" — PWA kurulumu.
// Android/Chrome: tarayıcının kurulum penceresini (beforeinstallprompt) açar.
// iPhone/iPad (Safari'de programla kurulum yok): "Paylaş → Ana Ekrana Ekle" adımlarını gösterir.
// Uygulama zaten ana ekrandan açıldıysa hiç görünmez.
import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const noopSubscribe = () => () => {};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ kendini Mac olarak tanıtır; dokunmatik ekranla ayırt edilir.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function InstallAppButton() {
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(noopSubscribe, isIos, () => false);
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // tarayıcının kendi bandı yerine bizim düğmemizle sorulsun
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || (!deferred && !ios)) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null); // olay tek kullanımlık
    } else {
      setShowIosHelp((v) => !v);
    }
  }

  return (
    <div className="relative z-10 mx-3 mb-3">
      <button
        type="button"
        onClick={install}
        className="flex w-full items-center gap-3 rounded-lg border border-espresso-line px-3 py-2.5 text-sm font-medium text-espresso-text/85 transition-colors hover:bg-espresso-2 hover:text-white"
      >
        <span className="text-base text-ember-bright">⤓</span>
        Telefona yükle
      </button>
      {showIosHelp && (
        <ol className="mt-2 space-y-1.5 rounded-lg bg-espresso-2 px-3 py-2.5 text-xs leading-relaxed text-espresso-text/85">
          <li>
            1. Safari&apos;de alttaki <span className="font-semibold text-white">Paylaş</span>{" "}
            düğmesine (□↑) dokun.
          </li>
          <li>
            2. <span className="font-semibold text-white">Ana Ekrana Ekle</span>&apos;yi seç.
          </li>
          <li>3. Konak Cari simgesi ana ekranına gelir; oradan aç.</li>
        </ol>
      )}
    </div>
  );
}
