interface PriorityStarsProps {
  priority: number;
}

export function PriorityStars({ priority }: PriorityStarsProps) {
  if (priority === 0) {
    return <span className="text-xs text-neutral-500">--</span>;
  }
  return (
    <span className="inline-flex gap-px" title={`Priority ${priority}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i < priority ? "bg-neutral-300" : "bg-neutral-800"
          }`}
        />
      ))}
    </span>
  );
}
