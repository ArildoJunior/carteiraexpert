import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-text-muted">
      <Link href="/" className="hover:text-text-primary transition-colors">
        Início
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.label} className="flex items-center gap-2">
            <span>/</span>
            {isLast || !item.href ? (
              <span className="font-medium text-text-primary" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="hover:text-text-primary transition-colors">
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
