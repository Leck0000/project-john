/**
 * TopBar component tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { TopBar } from './TopBar';

const makeStore = () =>
  configureStore({
    reducer: {
      auth: () => ({
        user: { id: '1', role: 'technician' as const, name: 'Test User' },
        roles: ['technician'],
      }),
    },
  });

const renderTopBar = () =>
  render(
    <Provider store={makeStore()}>
      <BrowserRouter>
        <TopBar />
      </BrowserRouter>
    </Provider>
  );

describe('TopBar', () => {
  it('renders the TopBar component', () => {
    renderTopBar();
    expect(screen.getByText('Ticket Queue')).toBeInTheDocument();
  });

  it('renders user name when user is authenticated', () => {
    renderTopBar();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderTopBar();
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });
});
