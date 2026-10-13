"use client";

// 小節ごとの記録。確認用の情報なので、折りたたんで控えめに置く。
import type { Session } from "../session/use-session.ts";

const HOW_LABELS = { start: "開始", auto: "自動", chosen: "選択" } as const;

export function BarLogPanel({ log }: Pick<Session, "log">) {
  return (
    <details className="log">
      <summary>
        小節ごとの記録<span className="log-count">{log.length}件・新しい順</span>
      </summary>
      {log.length === 0 ? (
        <p className="log-empty">開始すると、小節ごとのコードとJevの応答時間がここに並びます。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">小節</th>
                <th scope="col">コード</th>
                <th scope="col">選び方</th>
                <th scope="col">ソロ</th>
                <th scope="col">Jevの応答</th>
                <th scope="col">補足</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.bar}>
                  <td>{entry.bar}</td>
                  <td>{entry.chord}</td>
                  <td>{HOW_LABELS[entry.how]}</td>
                  {entry.solo ? (
                    <>
                      <td className="notes">{entry.solo.summary}</td>
                      <td>
                        {Math.round(entry.solo.latencyMs)}ms（{entry.solo.calls}回）
                      </td>
                      <td>{entry.solo.details}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="log-miss">
                      ソロが間に合いませんでした（伴奏のみ）
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
