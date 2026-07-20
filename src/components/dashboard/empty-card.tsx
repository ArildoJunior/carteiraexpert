import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmptyCardProps {
  title: string;
  message?: string;
}

export function EmptyCard({ title, message = "Sem dados disponiveis" }: EmptyCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
