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

// iPhone'da programla kurulum yok; elle ekleme adımları.
function IosSteps() {
  return (
    <>
      <li>
        1. Safari&apos;de alttaki <span className="font-semibold text-white">Paylaş</span>{" "}
        düğmesine (□↑) dokun.
      </li>
      <li>
        2. <span className="font-semibold text-white">Ana Ekrana Ekle</span>&apos;yi seç.
      </li>
      <li>3. Konak Cari simgesi ana ekranına gelir; oradan aç.</li>
    </>
  );
}

// variant: "sidebar" = masaüstü kenar çubuğunda geniş düğme;
//          "compact" = mobil üst barda küçük hap düğme (adımlar açılır kutuda).
export function InstallAppButton({ variant = "sidebar" }: { variant?: "sidebar" | "compact" }) {
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

  if (variant === "compact") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={install}
          aria-expanded={ios ? showIosHelp : undefined}
          className="flex h-8 items-center gap-1.5 rounded-full border border-espresso-line px-3 text-xs font-medium text-espresso-text/90 transition-colors active:bg-espresso-2"
        >
          <span className="text-ember-bright">⤓</span>
          Yükle
        </button>
        {showIosHelp && (
          <ol className="absolute right-0 top-full z-50 mt-2 w-64 space-y-1.5 rounded-lg border border-espresso-line bg-espresso-2 px-3 py-2.5 text-xs leading-relaxed text-espresso-text/85 shadow-pop">
            <IosSteps />
          </ol>
        )}
      </div>
    );
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
          <IosSteps />
        </ol>
      )}
    </div>
  );
}
