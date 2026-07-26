import { render, screen, fireEvent } from '@testing-library/react';
import { AgentBuilderWizard } from './AgentBuilderWizard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock('@/lib/api', () => ({
  useCreateAgent: () => ({
    mutate: vi.fn(),
    isPending: false
  }),
  useRuntimeModels: () => ({
    data: { models: [] },
    isFetching: false
  })
}));

describe('AgentBuilderWizard', () => {
  const queryClient = new QueryClient();

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AgentBuilderWizard onCancel={() => {}} />
      </QueryClientProvider>
    );
  };

  it('renders step 0 and templates', () => {
    renderComponent();
    expect(screen.getByTestId('agent-builder-wizard')).toBeInTheDocument();
    expect(screen.getByTestId('builder-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('template-blank')).toBeInTheDocument();
    expect(screen.getByTestId('template-fullstack')).toBeInTheDocument();
  });

  it('navigates to step 1 on blank template', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-blank'));
    expect(screen.getByTestId('builder-step-1')).toBeInTheDocument();
  });

  it('navigates to step 1 and pre-fills on template click', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-fullstack'));
    expect(screen.getByTestId('builder-step-1')).toBeInTheDocument();
    const input = screen.getByTestId('builder-name-input') as HTMLInputElement;
    expect(input.value).toBe('Fullstack Dev');
  });

  it('can navigate through all steps', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('template-blank'));
    
    // Step 1
    const nameInput = screen.getByTestId('builder-name-input');
    fireEvent.change(nameInput, { target: { value: 'Test Agent' } });
    fireEvent.click(screen.getByText('Next'));
    
    // Step 2
    expect(screen.getByTestId('builder-step-2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    
    // Step 3
    expect(screen.getByTestId('builder-step-3')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    
    // Step 4
    expect(screen.getByTestId('builder-step-4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('builder-submit'));
  });
});
