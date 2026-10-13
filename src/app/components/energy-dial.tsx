"use client";

// 盛り上がりのつまみ。ソロの音数と強さ、伴奏の刻み、背景の動きが次の小節から変わる。
import { ENERGY, ENERGY_LEVELS, type Energy } from "../../lib/solo/energy.ts";

type Props = {
  /** つまみの位置 */
  energy: Energy;
  /** 叩き方を足した、実際の盛り上がり */
  live: Energy;
  onChange: (energy: Energy) => void;
};

export function EnergyDial({ energy, live, onChange }: Props) {
  return (
    <fieldset className="energy">
      <legend className="energy-legend">
        盛り上がり
        <span className="energy-hint">
          {live > energy
            ? `あなたの演奏で「${ENERGY[live].label}」まで上がっています`
            : "次の小節から、ソロと伴奏が変わります（↑↓キーでも動かせます）"}
        </span>
      </legend>
      <div className="energy-track">
        {ENERGY_LEVELS.map((level) => (
          <label
            key={level}
            className="energy-step"
            data-active={level <= energy}
            data-boosted={level > energy && level <= live}
          >
            <input
              type="radio"
              name="energy"
              className="visually-hidden"
              value={level}
              checked={level === energy}
              onChange={() => onChange(level)}
            />
            {/* 段階は棒の本数でも示す（色や位置だけに頼らない） */}
            <span className="energy-bars" aria-hidden="true">
              {Array.from({ length: level }, (_, index) => (
                <span key={index} className="energy-bar" style={{ height: `${8 + index * 5}px` }} />
              ))}
            </span>
            <span className="energy-name">{ENERGY[level].label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
