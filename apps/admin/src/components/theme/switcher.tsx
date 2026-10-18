"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const choices = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ThemeSwitcher({ inHeader = false }: { inHeader?: boolean }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const { theme, setTheme } = useTheme();
  const current =
    choices.find((choice) => choice.value === (ready ? theme : "system")) ??
    choices[2];
  const Icon = current.icon;
  return (
    <div className={`theme-switcher${inHeader ? " theme-in-header" : ""}`}>
      <Select
        items={choices.map(({ value, label }) => ({ value, label }))}
        value={ready ? current.value : null}
        onValueChange={(value) => {
          if (value && choices.some((choice) => choice.value === value))
            setTheme(value);
        }}
      >
        <SelectTrigger
          className="theme-trigger"
          aria-label="Color theme"
          title={`Appearance: ${ready ? current.label : "System"}`}
        >
          <Icon size={18} aria-hidden="true" />
          <SelectValue className="theme-value" placeholder="Appearance" />
        </SelectTrigger>
        <SelectContent
          className="theme-menu"
          align="end"
          alignItemWithTrigger={false}
          sideOffset={8}
        >
          {choices.map(({ value, label, icon: ChoiceIcon }) => (
            <SelectItem value={value} key={value}>
              <ChoiceIcon size={16} aria-hidden="true" />
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
