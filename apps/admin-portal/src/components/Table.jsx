import React from "react";

export default function Table({ columns, rows, getRowKey, onRowClick, getGroupKey, renderGroupHeader }) {
  let previousGroupKey;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowKey = getRowKey(row);
            const groupKey = getGroupKey ? getGroupKey(row) : undefined;
            const showGroup = getGroupKey && groupKey !== previousGroupKey;
            previousGroupKey = groupKey;

            return (
              <React.Fragment key={rowKey}>
                {showGroup ? (
                  <tr className="table-group-row">
                    <td colSpan={columns.length}>
                      <span>{renderGroupHeader ? renderGroupHeader(groupKey, row) : groupKey}</span>
                    </td>
                  </tr>
                ) : null}
                <tr
                  className={onRowClick ? "row-link" : ""}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
