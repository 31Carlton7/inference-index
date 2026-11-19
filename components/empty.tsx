export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Unreadable({ file }: { file: string }) {
  return (
    <Empty title="This data could not be read">
      <code>{file}</code> on the data branch did not load or does not match the schema, so nothing is drawn from it.
    </Empty>
  );
}
