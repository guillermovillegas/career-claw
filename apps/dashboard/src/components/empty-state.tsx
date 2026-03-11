interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-800 py-16">
      <h3 className="text-[14px] font-medium text-neutral-400">{title}</h3>
      <p className="mt-1 text-[12px] text-neutral-600">{description}</p>
    </div>
  );
}
