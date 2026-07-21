import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/app/dashboard",
  useSearchParams: () => new URLSearchParams("period=1Y&benchmark=IBOV"),
}));

import { PeriodFilter } from "../period-filter";

describe("PeriodFilter", () => {
  it("renderiza os selects com os valores atuais", () => {
    render(<PeriodFilter currentPeriod="1Y" currentBenchmark="IBOV" />);
    expect(screen.getByLabelText(/periodo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/benchmark/i)).toBeInTheDocument();
  });
});
