"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Cuánto queda visible el «Guardado» antes de apagarse solo. */
const FLASH_MS = 2500;

/**
 * El estado de un botón de guardar: `saving` / `saved` / `error`.
 *
 * Existe porque Configuración tenía este mismo bloque escrito CUATRO veces —dos
 * `useState`, un `useRef` para el temporizador y el mismo try/catch/finally con
 * el flash de 2,5 s— una vez por tarjeta. Cuatro copias de «cómo se ve un
 * guardado» son cuatro sitios donde el quinto se escribe distinto.
 *
 * La limpieza al desmontar viene con el hook, así que se fue también el efecto
 * suelto que barría los cuatro temporizadores a mano: ahora cada uno se apaga
 * con su propio estado y no hay una lista que alguien tenga que acordarse de
 * ampliar al agregar la quinta tarjeta.
 */
export function useSaveState(mensajePorDefecto = "Error al guardar") {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(
    async (accion: () => Promise<void>) => {
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        await accion();
        setSaved(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSaved(false), FLASH_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : mensajePorDefecto);
      } finally {
        setSaving(false);
      }
    },
    [mensajePorDefecto],
  );

  return { saving, saved, error, setError, run };
}
