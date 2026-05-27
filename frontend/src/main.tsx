import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App.tsx";

const theme = createTheme({
  palette: {
    primary: { main: "#FF7300", dark: "#E55A00", light: "#FF9333" },
    secondary: { main: "#1a1a2e" },
    background: {
      default: "#F7F8FA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1a1a2e",
      secondary: "#525F7F",
    },
    divider: "#E5E7EB",
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif",
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: {
          borderColor: "#E5E7EB",
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: "1px solid #E5E7EB",
          transition: "box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease",
          "&:hover": {
            boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
            borderColor: "#D1D5DB",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, paddingInline: 16 },
        containedPrimary: {
          boxShadow: "none",
          "&:hover": { boxShadow: "0 4px 12px rgba(255,115,0,0.25)" },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: "#F9FAFB",
          "& .MuiTableCell-root": {
            fontWeight: 600,
            color: "#374151",
            fontSize: "0.78rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: "#F1F2F4" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, textTransform: "capitalize" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
        },
      },
    },
  },
});

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
