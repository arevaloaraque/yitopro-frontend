"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Movimiento de `/reports`, sobre anime.js v4.
 *
 * Tres reglas que no son de estilo:
 *
 * 1. **El contenido es visible por defecto.** Nada se esconde desde CSS. Quien
 *    oculta es este módulo, y solo cuando de verdad va a animar. Un `opacity-0`
 *    en la hoja de estilos deja la pantalla en blanco para quien tenga JS roto
 *    o `prefers-reduced-motion`, y un reporte en blanco es peor que uno sin
 *    animar.
 * 2. **anime.js se importa dinámicamente**, así que el resto del panel no paga
 *    sus bytes — el mismo trato que recharts. Como el import es asíncrono y el
 *    navegador ya pintó, el ocultado tiene que ser SÍNCRONO y antes del paint
 *    (`useLayoutEffect` + escritura directa de estilo), o se ve el parpadeo de
 *    aparecer-desaparecer-aparecer.
 * 3. **Hay red de seguridad.** Si el chunk no carga, el contenido se restaura
 *    solo: una animación que falla no puede llevarse la pantalla con ella.
 *
 * Los tres hooks de nivel de página (`useReveal`, `useAmbientPulse`,
 * `useHoverLift`) RECIBEN la ref en vez de crearla: los tres operan sobre el
 * mismo contenedor, y un elemento del DOM no admite tres refs. Los de nivel de
 * tarjeta (`useGrowBars`, `useDrawDonut`) sí devuelven la suya, porque cada uno
 * gobierna su propio subárbol.
 *
 * Y una que se aprendió midiendo: la entrada va **solo en la primera carga**.
 * Al cambiar de período la página vuelve a `loading` y remonta su contenido, de
 * modo que sin el interruptor la coreografía entera se repetiría en cada clic
 * del filtro — justo cuando lo que se quiere es comparar dos números, no verlos
 * entrar otra vez. Por eso los hooks reciben `enabled` y quien llama lo apaga
 * después de la primera vez.
 *
 * Lo que NO se anima, a propósito: el texto de los datos —un número a medio
 * camino es un número falso, y el count-up ya está acotado a la primera carga— y
 * nada disparado por scroll. El donut sí se traza, pero por `stroke-dasharray`:
 * el `dashoffset` está ocupado colocando cada porción en su ángulo.
 */

/** El único sitio donde se lee la preferencia. No es estilo, es WCAG. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// `useLayoutEffect` avisa por consola en el render del servidor. La página es
// cliente pero Next la prerenderiza igual, así que en servidor cae al efecto
// normal — donde este módulo no hace nada de todos modos.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Si el import no resolvió en este tiempo, se devuelve la visibilidad y ya. */
const FAILSAFE_MS = 1200;

function show(el: HTMLElement) {
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
}

function hide(el: HTMLElement) {
  el.style.opacity = "0";
  // 18 px y un 2% de escala: con 10 px y sin escala el movimiento existía —
  // medido en navegador— pero pasaba desapercibido en una pantalla rápida. Sigue
  // siendo transform puro, que el compositor anima sin recalcular layout.
  el.style.transform = "translateY(18px) scale(0.985)";
}

/**
 * Entrada escalonada de los elementos con `data-reveal` dentro del contenedor.
 *
 * El orden lo da el DOM, así que el escalonado recorre la pantalla como se lee.
 * Solo `opacity` y `transform`: las dos propiedades que el compositor anima sin
 * recalcular layout.
 *
 * `enabled` en false no toca ni un estilo: el contenido se queda como lo dejó
 * el markup.
 */
export function useReveal<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
) {
  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled || prefersReducedMotion()) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) return;

    targets.forEach(hide);
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      targets.forEach(show);
    };
    const failsafe = setTimeout(restore, FAILSAFE_MS);

    // Los iconos de cabecera entran aparte, un pelín después de su tarjeta: es
    // el detalle que hace que la entrada se NOTE sin alargarla.
    const icons = Array.from(root.querySelectorAll<HTMLElement>("[data-card-icon]"));
    icons.forEach((el) => {
      el.style.transform = "scale(0.6)";
      el.style.opacity = "0";
    });

    void import("animejs")
      .then(({ animate, stagger }) => {
        if (done) return;
        clearTimeout(failsafe);
        done = true;
        animate(targets, {
          opacity: [0, 1],
          translateY: [18, 0],
          scale: [0.985, 1],
          duration: 560,
          delay: stagger(70),
          ease: "out(3)",
          onComplete: () => targets.forEach(show),
        });
        animate(icons, {
          opacity: [0, 1],
          scale: [0.6, 1],
          duration: 620,
          delay: stagger(70, { start: 180 }),
          // Rebote corto: el icono es lo único que puede permitirse un gesto,
          // porque no lleva dato que haya que poder leer a mitad de camino.
          ease: "outBack(2.2)",
          onComplete: () => icons.forEach(show),
        });
      })
      .catch(() => {
        icons.forEach(show);
        restore();
      });

    return () => {
      clearTimeout(failsafe);
      done = true;
      targets.forEach(show);
      icons.forEach(show);
    };
  }, [ref, enabled]);
}

/**
 * Traza las porciones de un donut desde cero.
 *
 * Se anima `stroke-dasharray`, NO `stroke-dashoffset`: ese ya está ocupado
 * colocando cada porción en su ángulo, así que tocarlo pelearía con el cálculo
 * del offset y las porciones saltarían de sitio. La longitud del trazo sí es
 * libre, y crecerla de 0 a su valor dibuja la rueda llenándose.
 *
 * Cada porción declara su longitud final en `data-draw`, porque el valor vive en
 * el atributo compuesto (`"<largo> <circunferencia>"`) y hay que reconstruirlo.
 */
export function useDrawDonut<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled || prefersReducedMotion()) return;
    const slices = Array.from(root.querySelectorAll<SVGCircleElement>("[data-draw]"));
    if (slices.length === 0) return;

    const finals = slices.map((el) => el.getAttribute("stroke-dasharray") ?? "");
    const restore = () =>
      slices.forEach((el, i) => el.setAttribute("stroke-dasharray", finals[i]));
    slices.forEach((el, i) => {
      const total = finals[i].split(" ")[1] ?? "0";
      el.setAttribute("stroke-dasharray", `0 ${total}`);
    });
    let done = false;
    const failsafe = setTimeout(() => {
      if (done) return;
      done = true;
      restore();
    }, FAILSAFE_MS);

    void import("animejs")
      .then(({ animate }) => {
        if (done) return;
        clearTimeout(failsafe);
        done = true;
        // El escalonado se calcula a mano: `stagger()` reparte sobre UNA llamada
        // con varios objetivos, y aquí cada porción se anima por separado porque
        // su valor final es distinto.
        slices.forEach((el, i) => {
          const [len, total] = finals[i].split(" ");
          animate(el, {
            strokeDasharray: [`0 ${total}`, `${len} ${total}`],
            duration: 760,
            delay: 150 + i * 90,
            ease: "out(3)",
          });
        });
      })
      .catch(restore);

    return () => {
      clearTimeout(failsafe);
      done = true;
      restore();
    };
  }, [enabled]);

  return ref;
}

/**
 * Movimiento AMBIENTAL: sigue vivo después de que la página cargó.
 *
 * Dos grupos, con ritmos y FASES distintas a propósito. Si todo respirara al
 * mismo compás la pantalla pulsaría como un bloque, que es exactamente lo
 * invasivo; escalonados, el ojo percibe que la vista está viva sin que ningún
 * elemento reclame atención:
 *
 * | grupo               | qué hace                  | período | desfase |
 * |---------------------|---------------------------|---------|---------|
 * | `[data-card-glow]`  | halo que late en opacidad | 4,6 s   | 320 ms  |
 * | `[data-card-icon]`  | respira (escala 1→1.06)   | 3,2 s   | 240 ms  |
 *
 * Hay uno de cada por tarjeta, así que la vista entera respira sin que nada
 * dentro del contenido se mueva.
 *
 * **TRES cosas que NO se animan en bucle, y las tres por medición, no por gusto:**
 *
 * 1. **Ningún dato.** Un número o una barra a media animación es un valor falso,
 *    y un bucle no termina, así que no habría un instante en el que fuese cierto.
 * 2. **Ninguna caja clicable.** Una versión anterior flotaba la tarjeta entera
 *    (±2 px) y Playwright se negó a hacer hover con «element is not stable»: la
 *    caja no paraba nunca. No es un problema del test — cada tarjeta lleva
 *    enlaces («Ver conversaciones», «Ver pedidos») y un blanco en movimiento
 *    perpetuo es difícil de apuntar con el ratón y hostil para quien tenga
 *    temblor o control motor reducido. La vida va en elementos DECORATIVOS
 *    (`aria-hidden`, no clicables) dentro de cada tarjeta.
 * 3. **Nada DENTRO del gráfico.** Hubo un latido sobre el punto del mejor
 *    período; se quitó porque un elemento en movimiento encima de los datos
 *    compite con su lectura en vez de ayudarla. El punto sigue destacado —color
 *    `accent`, radio mayor— y el pie lo nombra con su fecha y su monto, que es
 *    lo que de verdad lo señala.
 *
 * Tres frenos, porque una animación infinita en un panel de trabajo es un gasto
 * permanente y una distracción permanente:
 *
 * 1. `prefers-reduced-motion` la desactiva por completo.
 * 2. Se PAUSA cuando la pestaña deja de estar visible. Sin esto seguiría
 *    latiendo en una pestaña de fondo, gastando batería para nadie.
 * 3. Solo `transform` y `opacity`: el compositor los anima sin recalcular layout
 *    ni repintar. Los desplazamientos son de 2 px y las escalas del 6%.
 */
const AMBIENT_GROUPS = [
  {
    selector: "[data-card-glow]",
    props: { opacity: [0.35, 0.9], scale: [1, 1.12] },
    duration: 4600,
    step: 320,
  },
  {
    selector: "[data-card-icon]",
    props: { scale: [1, 1.06] },
    duration: 3200,
    step: 240,
  },
] as const;

export function useAmbient<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || prefersReducedMotion()) return;

    type Anim = { pause: () => void; play: () => void; revert?: () => void };
    const running = new Map<Element, Anim>();
    let cancelled = false;
    let animateFn: ((t: unknown, p: unknown) => unknown) | null = null;

    const onVisibility = () => {
      running.forEach((a) => (document.hidden ? a.pause() : a.play()));
    };

    /**
     * Suelta las animaciones de elementos que ya no están en el documento.
     *
     * Sin esto el `Map` retenía la animación de cada tarjeta que un filtro
     * hiciera desaparecer, y su ticker seguía corriendo sobre un nodo huérfano:
     * una fuga pequeña pero permanente mientras la pantalla esté abierta.
     */
    const purge = () => {
      running.forEach((anim, el) => {
        if (el.isConnected) return;
        anim.pause();
        anim.revert?.();
        running.delete(el);
      });
    };

    /** Engancha lo que todavía no esté animándose. Idempotente. */
    const attach = () => {
      if (cancelled || !animateFn) return;
      for (const group of AMBIENT_GROUPS) {
        const targets = Array.from(root.querySelectorAll(group.selector));
        targets.forEach((el, i) => {
          if (running.has(el)) return;
          const anim = animateFn!(el, {
            ...group.props,
            duration: group.duration,
            // El desfase reparte la fase inicial: sin él todos arrancarían
            // juntos y la pantalla latiría como un solo bloque.
            delay: i * group.step,
            loop: true,
            alternate: true,
            ease: "inOutSine",
          }) as Anim;
          running.set(el, anim);
          if (document.hidden) anim.pause();
        });
      }
    };

    // El observador sigue haciendo falta aunque las tarjetas ya existan cuando
    // este efecto corre: los bloques son CONDICIONALES y un refetch por filtro
    // puede traer una tarjeta que antes venía en `null`, sin desmontar el resto.
    // Sin esto, esa tarjeta nueva se quedaría inerte.
    const observer = new MutationObserver(() => {
      purge();
      attach();
    });

    void import("animejs")
      .then(({ animate }) => {
        if (cancelled) return;
        animateFn = animate as typeof animateFn;
        attach();
        observer.observe(root, { childList: true, subtree: true });
        document.addEventListener("visibilitychange", onVisibility);
      })
      .catch(() => {
        // Sin anime.js no hay ambiente, y no pasa nada: todo está ya pintado en
        // su sitio.
      });

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      running.forEach((a) => {
        a.pause();
        a.revert?.();
      });
      running.clear();
    };
  }, [ref, enabled]);
}

/**
 * Respuesta al puntero, con anime.js y no con una transición CSS.
 *
 * Es movimiento posterior a la carga pero NO ambiental: ocurre solo cuando
 * alguien apunta a una tarjeta, así que no puede distraer a quien está leyendo
 * otra. Se anima el contenedor entero —3 px— porque el gesto tiene que decir
 * «esta tarjeta», no «este texto».
 *
 * Con `prefers-reduced-motion` no se registra ni el listener: no es que la
 * animación quede en cero, es que no existe.
 *
 * `enabled` no es un interruptor de gusto: en el primer render la página devuelve
 * el cargador SIN este contenedor, así que `ref.current` es `null` y el efecto
 * salía para no volver. Con la dependencia se engancha cuando el contenedor ya
 * existe — verificado en navegador, antes el hover no movía nada.
 */
export function useHoverLift<T extends HTMLElement>(
  ref: RefObject<T | null>,
  /** Pásale algo que se vuelva `true` cuando el contenedor ya está en el DOM. */
  enabled: boolean,
) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || prefersReducedMotion()) return;

    let animateFn: ((t: unknown, p: unknown) => unknown) | null = null;
    let lifted: HTMLElement | null = null;
    // `translateY` otra vez: la tarjeta ya no flota por su cuenta, así que no hay
    // nada que se pise. Y el desplazamiento es finito —termina y se queda— así
    // que el blanco de clic vuelve a estar quieto en cuanto acaba el gesto.
    const move = (el: HTMLElement, up: boolean) => {
      animateFn?.(el, { translateY: up ? -3 : 0, duration: 220, ease: "out(2)" });
    };

    // DELEGACIÓN en el contenedor, no un listener por tarjeta: cuando este
    // efecto corre las tarjetas todavía no existen —la página está mostrando el
    // cargador—, así que recorrerlas aquí encontraba cero y el hover no
    // funcionaba nunca. Delegando da igual cuándo aparezcan, y sobrevive a que
    // los bloques cambien al filtrar.
    const onOver = (e: Event) => {
      const card = (e.target as Element | null)?.closest<HTMLElement>("[data-reveal]");
      if (!card || card === lifted) return;
      if (lifted) move(lifted, false);
      lifted = card;
      move(card, true);
    };
    const onOut = (e: PointerEvent) => {
      if (!lifted) return;
      // `pointerout` salta también al pasar entre hijos de la misma tarjeta:
      // solo cuenta si el puntero salió DE la tarjeta.
      const to = e.relatedTarget as Element | null;
      if (to && lifted.contains(to)) return;
      move(lifted, false);
      lifted = null;
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut as EventListener);

    let cancelled = false;
    void import("animejs")
      .then((m) => {
        if (!cancelled) animateFn = m.animate as typeof animateFn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut as EventListener);
      lifted?.style.removeProperty("transform");
    };
  }, [ref, enabled]);
}

/**
 * Crece una barra proporcional de 0 a su ancho final.
 *
 * `scaleX` y no `width`: animar `width` reflowea la fila en cada frame. El
 * elemento se declara al 100% con `transform-origin: left` y aquí solo se
 * escala, así que el valor final lo sigue mandando el estilo, no la animación.
 */
export function useGrowBars<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled || prefersReducedMotion()) return;
    const bars = Array.from(root.querySelectorAll<HTMLElement>("[data-bar]"));
    if (bars.length === 0) return;

    bars.forEach((el) => {
      el.style.transform = "scaleX(0)";
    });
    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      bars.forEach((el) => el.style.removeProperty("transform"));
    };
    const failsafe = setTimeout(restore, FAILSAFE_MS);

    void import("animejs")
      .then(({ animate, stagger }) => {
        if (done) return;
        clearTimeout(failsafe);
        done = true;
        animate(bars, {
          scaleX: [0, 1],
          duration: 620,
          delay: stagger(45, { start: 120 }),
          ease: "out(4)",
          onComplete: () => bars.forEach((el) => el.style.removeProperty("transform")),
        });
      })
      .catch(restore);

    return () => {
      clearTimeout(failsafe);
      done = true;
      bars.forEach((el) => el.style.removeProperty("transform"));
    };
  }, [enabled]);

  return ref;
}
