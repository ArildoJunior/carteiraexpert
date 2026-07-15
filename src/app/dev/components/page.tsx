"use client";

import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function ComponentsPage() {
  return (
    <>
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Design System</h1>
          <p className="text-muted-foreground mt-2">
            carteiraexpert â€” vitrine de todos os componentes instalados.
          </p>
        </header>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Cards</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Card simples</CardTitle>
                <CardDescription>DescriÃ§Ã£o do card</CardDescription>
              </CardHeader>
              <CardContent>
                <p>ConteÃºdo do card com texto descritivo.</p>
              </CardContent>
              <CardFooter>
                <Button variant="outline">AÃ§Ã£o</Button>
              </CardFooter>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Com badge</CardTitle>
                <CardDescription>Indicador de status</CardDescription>
              </CardHeader>
              <CardContent className="space-x-2 space-y-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Forms</h2>
          <div className="grid gap-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="seu@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">Senha</Label>
              <Input id="pwd" type="password" />
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="notif" />
              <Label htmlFor="notif">NotificaÃ§Ãµes ativas</Label>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Tabs</h2>
          <Tabs defaultValue="tab1" className="max-w-md">
            <TabsList>
              <TabsTrigger value="tab1">Aba 1</TabsTrigger>
              <TabsTrigger value="tab2">Aba 2</TabsTrigger>
              <TabsTrigger value="tab3">Aba 3</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1">ConteÃºdo da aba 1</TabsContent>
            <TabsContent value="tab2">ConteÃºdo da aba 2</TabsContent>
            <TabsContent value="tab3">ConteÃºdo da aba 3</TabsContent>
          </Tabs>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Table</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">PreÃ§o</TableHead>
                  <TableHead className="text-right">VariaÃ§Ã£o</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">PETR4</TableCell>
                  <TableCell>Petrobras</TableCell>
                  <TableCell className="text-right">R$ 38,42</TableCell>
                  <TableCell className="text-right text-success">+1,23%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">VALE3</TableCell>
                  <TableCell>Vale</TableCell>
                  <TableCell className="text-right">R$ 64,18</TableCell>
                  <TableCell className="text-right text-destructive">-0,87%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">HGLG11</TableCell>
                  <TableCell>CSHG LogÃ­stica</TableCell>
                  <TableCell className="text-right">R$ 168,90</TableCell>
                  <TableCell className="text-right text-success">+0,45%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Toast (Sonner)</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => toast("NotificaÃ§Ã£o padrÃ£o")}>PadrÃ£o</Button>
            <Button onClick={() => toast.success("OperaÃ§Ã£o realizada!")} variant="default">
              Sucesso
            </Button>
            <Button onClick={() => toast.error("Algo deu errado")} variant="destructive">
              Erro
            </Button>
            <Button
              onClick={() => toast.warning("AtenÃ§Ã£o: verifique os dados")}
              variant="outline"
            >
              Aviso
            </Button>
            <Button onClick={() => toast.info("InformaÃ§Ã£o Ãºtil")} variant="secondary">
              Info
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Skeleton (loading)</h2>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-12 w-full" />
          </div>
        </section>
      </main>
      <Toaster richColors position="bottom-right" />
    </>
  );
}
