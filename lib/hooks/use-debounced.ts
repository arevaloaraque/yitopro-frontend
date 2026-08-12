"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Valor que se retrasa hasta que deja de cambiar. Para un buscador: se teclea
 * `search` y se consulta con `useDebounced(search)`.
 *
 * Existía a mano cuatro veces (pagos, clientes, productos, servicios), siempre
 * el mismo `useRef<setTimeout>` + efecto, y con DOS semánticas distintas que
 * conviene no volver a mezclar:
 *
 * - Pagos retrasaba el VALOR y derivaba el fetch de él. Es la buena: el valor
 *   retrasado también sirve para escribirlo en la URL, y así no se hace un
 *   `replaceState` por pulsación.
 * - Las otras tres retrasaban la LLAMADA. Funciona para pedir datos, pero no
 *   deja nada que observar, así que cualquier otra cosa que dependa del término
 *   de búsqueda se dispara con cada tecla.
 *
 * NO sustituye al debounce de `customer-combobox.tsx`: ese envuelve un fetch,
 * no un valor, y es otra firma.
 */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);

  return debounced;
}
