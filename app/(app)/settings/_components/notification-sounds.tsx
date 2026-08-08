"use client";

import { Volume2 } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getDefaultSoundAssignments,
  getSoundAssignments,
  getSoundVolume,
  isSoundMuted,
  previewAlertSound,
  previewSound,
  setSlotSound,
  setSoundMuted,
  setSoundVolume,
  SOUND_CHOICES,
  subscribeSoundSettings,
  type SoundId,
  type SoundSlot,
} from "@/lib/notifications/sound";
import {
  areToastsEnabled,
  setToastsEnabled,
  subscribeNotificationPreferences,
} from "@/lib/notifications/preferences";

const SLOTS: { slot: SoundSlot; label: string; hint: string }[] = [
  {
    slot: "message",
    label: "Mensajes de clientes",
    hint: "Suena cuando un cliente te escribe por WhatsApp.",
  },
  {
    slot: "order",
    label: "Pedidos",
    hint: "Suena cuando entra un pedido, o uno que queda por confirmar.",
  },
  {
    slot: "appointment",
    label: "Cambios en la agenda",
    hint: "Suena cuando se agenda, se reagenda o se cancela una cita.",
  },
];

/**
 * Which sound plays for each kind of event, how loud, and the on/off.
 *
 * These are preferences of the person at the console, not business data: they live in
 * localStorage next to the mute. Nothing server-side ever plays a sound, so there is no
 * backend field to add — with one consequence worth knowing: it is per browser, so the
 * same operator on a second device picks again.
 *
 * The selects never offer a sound another slot already uses. Telling "a customer wrote"
 * apart from "an order came in" apart from "the agenda moved" WITHOUT looking at the
 * screen is the entire point of choosing, and identical pings defeat it. `setSlotSound`
 * swaps instead of duplicating, so the invariant holds even if this UI is bypassed — a
 * rule only the form enforces is not a rule.
 *
 * The escalation sound is shown but NOT selectable: it means a person is waiting, and an
 * operator who gave it their message ping would stop noticing escalations. It can still
 * be auditioned, because "what will that one sound like?" is a fair question.
 */
export function NotificationSounds() {
  const assignments = useSyncExternalStore(
    subscribeSoundSettings,
    getSoundAssignments,
    getDefaultSoundAssignments,
  );
  const muted = useSyncExternalStore(subscribeSoundSettings, isSoundMuted, () => false);
  const volume = useSyncExternalStore(subscribeSoundSettings, getSoundVolume, () => 1);
  const toastsEnabled = useSyncExternalStore(
    subscribeNotificationPreferences,
    areToastsEnabled,
    () => true,
  );

  return (
    <div className="space-y-6">
      {/* Va PRIMERO y separado: apagar los avisos emergentes deja sin efecto todo lo de
          abajo, así que tiene que leerse antes de que alguien configure timbres que no va
          a escuchar. */}
      <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <Label htmlFor="notif-toasts-on">Mostrar avisos emergentes</Label>
          <p className="text-[0.7rem] text-muted-foreground">
            Las tarjetas que aparecen en la esquina. Si las apagás, las notificaciones
            siguen llegando a la campana: no se pierde ninguna, solo dejan de
            interrumpirte.
          </p>
        </div>
        <Switch
          id="notif-toasts-on"
          checked={toastsEnabled}
          onChange={setToastsEnabled}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="notif-sound-on">Avisos con sonido</Label>
          <p className="text-[0.7rem] text-muted-foreground">
            Si lo apagás, las notificaciones siguen apareciendo en la campana, sin
            sonar.
          </p>
        </div>
        <Switch
          id="notif-sound-on"
          checked={!muted}
          onChange={(on) => {
            setSoundMuted(!on);
            // Turning it back on plays something, so the operator knows it works.
            if (on) previewSound(assignments.message);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notif-sound-volume">Volumen</Label>
        <p className="text-[0.7rem] text-muted-foreground">
          Para trabajar en un local con gente: bajalo en vez de apagarlo.
        </p>
        {/* Native range input: a slider is a solved platform control, and this one
            needs no behaviour the browser doesn't already give it. */}
        <input
          id="notif-sound-volume"
          type="range"
          // `min={5}`, not 0: a zero volume is silent while the switch above still says
          // sound is ON, which on a console whose whole job is not missing a customer is a
          // trap. "No sound" has exactly one control, and it is the switch.
          min={5}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={muted}
          aria-valuetext={`${Math.round(volume * 100)}%`}
          className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => setSoundVolume(Number(event.target.value) / 100)}
          // Audition on RELEASE, not on change: React maps a range's onChange to `input`,
          // so one drag across the track fires ~20 previews, each scheduled at
          // currentTime — they overlap into a garble that gets louder with the level being
          // dragged. A keyboard step is one release, so it still previews per arrow press.
          onPointerUp={() => previewSound(assignments.message)}
          onKeyUp={() => previewSound(assignments.message)}
        />
      </div>

      {SLOTS.map(({ slot, label, hint }) => {
        // The other slots' sounds are not offered here: that is what makes "the same for
        // two events" unrepresentable instead of an error message to dismiss.
        const taken = new Set(
          SLOTS.filter((entry) => entry.slot !== slot).map((entry) => assignments[entry.slot]),
        );
        const options = SOUND_CHOICES.filter((choice) => !taken.has(choice.id));
        return (
          <div key={slot} className="space-y-2">
            <Label htmlFor={`sound-${slot}`}>{label}</Label>
            <p className="text-[0.7rem] text-muted-foreground">{hint}</p>
            <div className="flex items-center gap-2">
              <Select
                items={options.map((choice) => ({
                  value: choice.id,
                  label: choice.label,
                }))}
                value={assignments[slot]}
                onValueChange={(value) => {
                  const id = (value ?? assignments[slot]) as SoundId;
                  setSlotSound(slot, id);
                  // Choosing IS the audition: no separate "probar" step to discover.
                  previewSound(id);
                }}
              >
                <SelectTrigger id={`sound-${slot}`} className="w-full">
                  <SelectValue placeholder="Elegí un sonido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {options.map((choice) => (
                      <SelectItem key={choice.id} value={choice.id}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Escuchar el sonido de ${label.toLowerCase()}`}
                onClick={() => previewSound(assignments[slot])}
              >
                <Volume2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="space-y-2">
        <Label>Escalamiento a una persona</Label>
        <p className="text-[0.7rem] text-muted-foreground">
          Un toque grave y doble, fijo: es el aviso de que alguien está esperando a un
          humano, así que no se puede cambiar ni confundir con los demás.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Escuchar el sonido de escalamiento"
          onClick={() => previewAlertSound()}
        >
          <Volume2 className="mr-2 size-4" />
          Escuchar
        </Button>
      </div>
    </div>
  );
}
