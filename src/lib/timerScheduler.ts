import { Clock } from "lucide-react";
import React, { useState, useEffect } from "react";

export interface TimerNodeConfig {
  mode: "interval" | "daily" | "weekly" | "combined";
  intervalHours?: number;
  time?: string;
  dayOfWeek?: string;
  enabled: boolean;
}

export interface TimerSchedule {
  workflowId: string;
  nodeId: string;
  config: TimerNodeConfig;
  nextRun?: Date;
  lastRun?: Date;
  intervalId?: NodeJS.Timeout;
}

class TimerScheduler {
  private schedules: Map<string, TimerSchedule> = new Map();
  private onTrigger?: (workflowId: string) => void;

  setTriggerCallback(callback: (workflowId: string) => void) {
    this.onTrigger = callback;
  }

  addSchedule(workflowId: string, nodeId: string, config: TimerNodeConfig) {
    if (!config.enabled) return;

    const scheduleId = `${workflowId}-${nodeId}`;
    this.removeSchedule(scheduleId);

    const schedule: TimerSchedule = {
      workflowId,
      nodeId,
      config,
      nextRun: this.calculateNextRun(config),
    };

    switch (config.mode) {
      case "interval":
        if (config.intervalHours && config.intervalHours > 0) {
          const intervalMs = config.intervalHours * 60 * 60 * 1000;
          schedule.intervalId = setInterval(() => {
            this.triggerWorkflow(workflowId);
            schedule.lastRun = new Date();
            schedule.nextRun = new Date(Date.now() + intervalMs);
          }, intervalMs);
        }
        break;

      case "daily":
      case "weekly":
      case "combined":
        // Check every minute if we should run
        schedule.intervalId = setInterval(() => {
          if (this.shouldRunNow(config)) {
            this.triggerWorkflow(workflowId);
            schedule.lastRun = new Date();
            schedule.nextRun = this.calculateNextRun(config);
          }
        }, 60000); // Check every minute
        break;
    }

    this.schedules.set(scheduleId, schedule);
  }

  removeSchedule(scheduleId: string) {
    const schedule = this.schedules.get(scheduleId);
    if (schedule?.intervalId) {
      clearInterval(schedule.intervalId);
    }
    this.schedules.delete(scheduleId);
  }

  clearAll() {
    for (const [id] of this.schedules) {
      this.removeSchedule(id);
    }
  }

  getSchedules() {
    return Array.from(this.schedules.values());
  }

  private calculateNextRun(config: TimerNodeConfig): Date {
    const now = new Date();

    switch (config.mode) {
      case "interval":
        if (config.intervalHours) {
          return new Date(now.getTime() + config.intervalHours * 60 * 60 * 1000);
        }
        break;

      case "daily":
        if (config.time) {
          const [hours, minutes] = config.time.split(":").map(Number);
          const next = new Date(now);
          next.setHours(hours, minutes, 0, 0);
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
          return next;
        }
        break;

      case "weekly":
        if (config.dayOfWeek) {
          const targetDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(config.dayOfWeek);
          const next = new Date(now);
          const currentDay = next.getDay();
          const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
          next.setDate(next.getDate() + daysUntil);
          next.setHours(9, 0, 0, 0);
          return next;
        }
        break;

      case "combined":
        if (config.time && config.dayOfWeek) {
          const [hours, minutes] = config.time.split(":").map(Number);
          const targetDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(config.dayOfWeek);
          const next = new Date(now);
          const currentDay = next.getDay();
          const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
          next.setDate(next.getDate() + daysUntil);
          next.setHours(hours, minutes, 0, 0);
          return next;
        }
        break;
    }

    return new Date(now.getTime() + 60 * 60 * 1000); // Default: 1 hour
  }

  private shouldRunNow(config: TimerNodeConfig): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    switch (config.mode) {
      case "daily":
        if (config.time) {
          const [targetHour, targetMinute] = config.time.split(":").map(Number);
          return currentHour === targetHour && currentMinute === targetMinute;
        }
        break;

      case "weekly":
        if (config.dayOfWeek) {
          const targetDay = dayNames.indexOf(config.dayOfWeek);
          return currentDay === targetDay && currentHour === 9 && currentMinute === 0;
        }
        break;

      case "combined":
        if (config.time && config.dayOfWeek) {
          const [targetHour, targetMinute] = config.time.split(":").map(Number);
          const targetDay = dayNames.indexOf(config.dayOfWeek);
          return currentDay === targetDay && currentHour === targetHour && currentMinute === targetMinute;
        }
        break;
    }

    return false;
  }

  private triggerWorkflow(workflowId: string) {
    console.log(`[Timer] Triggering workflow: ${workflowId}`);
    if (this.onTrigger) {
      this.onTrigger(workflowId);
    }
  }
}

export const timerScheduler = new TimerScheduler();
