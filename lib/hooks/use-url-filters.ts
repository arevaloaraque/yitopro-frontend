"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Filtros de una tabla que viven en la URL: una vista filtrada se comparte por
 * chat y sobrevive un reload. Quien encuentra el problema casi nunca es quien
 * lo arregla.
 *
 * Se sembró desde `/payments`, la única pantalla que lo tenía, con dos trampas
 * que un copiar-pegar habría traído:
 *
 * 1. **Preserva las claves que no gestiona.** El efecto de pagos reconstruía
 *    los params DESDE CERO, lo cual está bien ahí porque es la única pantalla
 *    sin `?id=`. En clientes, conversaciones, citas y el detalle de pedido, ese
 *    `?id=` es contrato: lo escriben los toasts, el dashboard y los enlaces del
 *    drawer. Borrarlo cerraría el hilo abierto al teclear en el buscador. Por
 *    eso se parte de `window.location.search` vigente, no de un snapshot.
 * 2. **Omite lo que vale el default**, para que la URL limpia sea `/clientes` y
 *    no `/clientes?q=&status=all`.
 *
 * El valor de búsqueda que se le pase debe venir ya retrasado (`useDebounced`):
 * escribir el crudo hace un `replaceState` por pulsación.
 *
 * `useSearchParams` obliga a un `<Suspense>` en el App Router — el mismo que ya
 * envuelve pagos, clientes y conversaciones.
 */
export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const searchParams = useSearchParams();
  // Los defaults se congelan en el primer render: son la referencia contra la
  // que se decide qué se omite de la URL, y un objeto literal nuevo por render
  // dispararía el efecto siempre. Va en `useState` y no en un `useRef` porque
  // se LEE durante el render (`react-hooks/refs` prohíbe eso, y con razón: un
  // ref leído en render no es reactivo).
  const [initial] = useState(defaults);

  const [values, setValues] = useState<T>(() => {
    const seeded = { ...initial };
    for (const key of Object.keys(seeded)) {
      const fromUrl = searchParams.get(key);
      if (fromUrl !== null) seeded[key as keyof T] = fromUrl as T[keyof T];
    }
    return seeded;
  });

  const set = useCallback((patch: Partial<T>) => {
    setValues((prev) => {
      // Devolver el MISMO objeto cuando nada cambia no es una micro-optimización:
      // este objeto acaba en las dependencias del `useMemo`/`useCallback` que
      // arma el fetch de cada pantalla. Una identidad nueva por cada `set` con
      // el mismo valor pide la lista dos veces al montar, y con un `set` dentro
      // del propio efecto de carga entra en bucle.
      let changed = false;
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (!Object.is(prev[key], patch[key])) {
          changed = true;
          break;
        }
      }
      return changed ? { ...prev, ...patch } : prev;
    });
  }, []);

  useEffect(() => {
    // `replaceState`, no `router.push`: empujar añadiría una entrada de
    // historial por pulsación y volvería a renderizar la ruta para cambiar un
    // query param.
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value === initial[key]) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [values, initial]);

  return [values, set];
}
