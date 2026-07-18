import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportacoesPendentesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
