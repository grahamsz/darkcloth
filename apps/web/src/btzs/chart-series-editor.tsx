import { type ChangeEvent } from "react";
import {
  createBtzsChartRowDraft,
  getBtzsChartSeriesRowErrors,
  type BtzsChartSeriesDraft,
} from "./chart-data";

interface BtzsChartSeriesEditorProps {
  series: BtzsChartSeriesDraft[];
  onChange: (next: BtzsChartSeriesDraft[]) => void;
}

export function BtzsChartSeriesEditor({ series, onChange }: BtzsChartSeriesEditorProps) {
  const updateSeries = (seriesIndex: number, nextSeries: BtzsChartSeriesDraft) => {
    onChange(series.map((entry, index) => (index === seriesIndex ? nextSeries : entry)));
  };

  const updateRow = (
    seriesIndex: number,
    rowIndex: number,
    field: "averageG" | "value",
    value: string,
  ) => {
    const entry = series[seriesIndex];
    if (!entry) return;

    const nextRows = entry.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row));
    updateSeries(seriesIndex, { ...entry, rows: nextRows });
  };

  const addRow = (seriesIndex: number) => {
    const entry = series[seriesIndex];
    if (!entry) return;

    updateSeries(seriesIndex, {
      ...entry,
      rows: [...entry.rows, createBtzsChartRowDraft()],
    });
  };

  const removeRow = (seriesIndex: number, rowIndex: number) => {
    const entry = series[seriesIndex];
    if (!entry) return;

    const nextRows = entry.rows.filter((_, index) => index !== rowIndex);
    updateSeries(seriesIndex, {
      ...entry,
      rows: nextRows.length > 0 ? nextRows : [createBtzsChartRowDraft()],
    });
  };

  return (
    <div className="btzs-chart-editor">
      {series.map((entry, seriesIndex) => {
        const rowErrors = getBtzsChartSeriesRowErrors(entry);

        return (
          <section key={entry.kind} className="btzs-chart-editor-section">
            <div className="btzs-chart-editor-header">
              <div className="btzs-chart-editor-heading">
                <h5>{entry.sectionTitle}</h5>
                <p>
                  Enter <strong>Average G</strong> and <strong>{entry.valueLabel}</strong> values. Empty rows are
                  ignored on save.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => addRow(seriesIndex)}>
                Add row
              </button>
            </div>

            <div className="btzs-chart-table-wrap btzs-chart-table-wrap--editor">
              <table className="btzs-chart-table btzs-chart-table--editor">
                <thead>
                  <tr>
                    <th>Average G</th>
                    <th>{entry.valueLabel}</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {entry.rows.map((row, rowIndex) => {
                    const errors = rowErrors[rowIndex] ?? { averageG: null, value: null };

                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="btzs-chart-cell">
                            <input
                              aria-invalid={Boolean(errors.averageG)}
                              inputMode="decimal"
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                updateRow(seriesIndex, rowIndex, "averageG", event.target.value)
                              }
                              type="text"
                              value={row.averageG}
                            />
                            {errors.averageG && <p className="btzs-chart-cell-error">{errors.averageG}</p>}
                          </div>
                        </td>
                        <td>
                          <div className="btzs-chart-cell">
                            <input
                              aria-invalid={Boolean(errors.value)}
                              inputMode="decimal"
                              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                updateRow(seriesIndex, rowIndex, "value", event.target.value)
                              }
                              type="text"
                              value={row.value}
                            />
                            {errors.value && <p className="btzs-chart-cell-error">{errors.value}</p>}
                          </div>
                        </td>
                        <td className="btzs-chart-row-actions">
                          <button
                            type="button"
                            className="btn-danger-ghost"
                            onClick={() => removeRow(seriesIndex, rowIndex)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
