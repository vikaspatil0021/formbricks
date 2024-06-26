import "server-only";

import { Prisma } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { unstable_cache } from "next/cache";

import { prisma } from "@formbricks/database";
import { TActionClassType } from "@formbricks/types/actionClasses";
import { TAction, TActionInput, ZAction, ZActionInput } from "@formbricks/types/actions";
import { ZOptionalNumber } from "@formbricks/types/common";
import { ZId } from "@formbricks/types/environment";
import { DatabaseError } from "@formbricks/types/errors";

import { actionClassCache } from "../actionClass/cache";
import { createActionClass, getActionClassByEnvironmentIdAndName } from "../actionClass/service";
import { ITEMS_PER_PAGE, SERVICES_REVALIDATION_INTERVAL } from "../constants";
import { activePersonCache } from "../person/cache";
import { getIsPersonMonthlyActive } from "../person/service";
import { formatDateFields } from "../utils/datetime";
import { validateInputs } from "../utils/validate";
import { actionCache } from "./cache";
import { getStartDateOfLastMonth, getStartDateOfLastQuarter, getStartDateOfLastWeek } from "./utils";

export const getActionsByPersonId = async (personId: string, page?: number): Promise<TAction[]> => {
  const actions = await unstable_cache(
    async () => {
      validateInputs([personId, ZId], [page, ZOptionalNumber]);

      try {
        const actionsPrisma = await prisma.action.findMany({
          where: {
            person: {
              id: personId,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: page ? ITEMS_PER_PAGE : undefined,
          skip: page ? ITEMS_PER_PAGE * (page - 1) : undefined,
          include: {
            actionClass: true,
          },
        });

        return actionsPrisma.map((action) => ({
          id: action.id,
          createdAt: action.createdAt,
          personId: action.personId,
          properties: action.properties,
          actionClass: action.actionClass,
        }));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          throw new DatabaseError("Database operation failed");
        }

        throw error;
      }
    },
    [`getActionsByPersonId-${personId}-${page}`],
    {
      tags: [actionCache.tag.byPersonId(personId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

  // Deserialize dates if caching does not support deserialization
  return actions.map((action) => formatDateFields(action, ZAction));
};

export const getActionsByEnvironmentId = async (environmentId: string, page?: number): Promise<TAction[]> => {
  const actions = await unstable_cache(
    async () => {
      validateInputs([environmentId, ZId], [page, ZOptionalNumber]);

      try {
        const actionsPrisma = await prisma.action.findMany({
          where: {
            actionClass: {
              environmentId: environmentId,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: page ? ITEMS_PER_PAGE : undefined,
          skip: page ? ITEMS_PER_PAGE * (page - 1) : undefined,
          include: {
            actionClass: true,
          },
        });
        const actions: TAction[] = [];
        // transforming response to type TAction[]
        actionsPrisma.forEach((action) => {
          actions.push({
            id: action.id,
            createdAt: action.createdAt,
            // sessionId: action.sessionId,
            personId: action.personId,
            properties: action.properties,
            actionClass: action.actionClass,
          });
        });
        return actions;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          throw new DatabaseError("Database operation failed");
        }

        throw error;
      }
    },
    [`getActionsByEnvironmentId-${environmentId}-${page}`],
    {
      tags: [actionCache.tag.byEnvironmentId(environmentId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

  // since the unstable_cache function does not support deserialization of dates, we need to manually deserialize them
  // https://github.com/vercel/next.js/issues/51613

  return actions.map((action) => formatDateFields(action, ZAction));
};

export const createAction = async (data: TActionInput): Promise<TAction> => {
  validateInputs([data, ZActionInput]);

  try {
    const { environmentId, name, userId } = data;

    let actionType: TActionClassType = "code";
    if (name === "Exit Intent (Desktop)" || name === "50% Scroll") {
      actionType = "automatic";
    }

    let actionClass = await getActionClassByEnvironmentIdAndName(environmentId, name);

    if (!actionClass) {
      actionClass = await createActionClass(environmentId, {
        name,
        type: actionType,
        environmentId,
      });
    }

    const action = await prisma.action.create({
      data: {
        person: {
          connect: {
            environmentId_userId: {
              environmentId,
              userId,
            },
          },
        },
        actionClass: {
          connect: {
            id: actionClass.id,
          },
        },
      },
    });

    const isPersonMonthlyActive = await getIsPersonMonthlyActive(action.personId);
    if (!isPersonMonthlyActive) {
      activePersonCache.revalidate({ id: action.personId });
    }

    actionCache.revalidate({
      environmentId,
      personId: action.personId,
    });

    return {
      id: action.id,
      createdAt: action.createdAt,
      personId: action.personId,
      properties: action.properties,
      actionClass,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError("Database operation failed");
    }

    throw error;
  }
};

export const getActionCountInLastHour = async (actionClassId: string): Promise<number> =>
  unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId]);

      try {
        const numEventsLastHour = await prisma.action.count({
          where: {
            actionClassId: actionClassId,
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000),
            },
          },
        });
        return numEventsLastHour;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLastHour-${actionClassId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getActionCountInLast24Hours = async (actionClassId: string): Promise<number> =>
  unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId]);

      try {
        const numEventsLast24Hours = await prisma.action.count({
          where: {
            actionClassId: actionClassId,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        });
        return numEventsLast24Hours;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLast24Hours-${actionClassId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getActionCountInLast7Days = async (actionClassId: string): Promise<number> =>
  unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId]);

      try {
        const numEventsLast7Days = await prisma.action.count({
          where: {
            actionClassId: actionClassId,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });
        return numEventsLast7Days;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLast7Days-${actionClassId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getActionCountInLastQuarter = async (actionClassId: string, personId: string): Promise<number> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const numEventsLastQuarter = await prisma.action.count({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
            createdAt: {
              gte: getStartDateOfLastQuarter(),
            },
          },
        });

        return numEventsLastQuarter;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLastQuarter-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getActionCountInLastMonth = async (actionClassId: string, personId: string): Promise<number> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const numEventsLastMonth = await prisma.action.count({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
            createdAt: {
              gte: getStartDateOfLastMonth(),
            },
          },
        });

        return numEventsLastMonth;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLastMonth-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getActionCountInLastWeek = async (actionClassId: string, personId: string): Promise<number> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const numEventsLastWeek = await prisma.action.count({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
            createdAt: {
              gte: getStartDateOfLastWeek(),
            },
          },
        });
        return numEventsLastWeek;
      } catch (error) {
        throw error;
      }
    },
    [`getActionCountInLastWeek-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getTotalOccurrencesForAction = async (
  actionClassId: string,
  personId: string
): Promise<number> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const count = await prisma.action.count({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
          },
        });

        return count;
      } catch (error) {
        throw error;
      }
    },
    [`getTotalOccurrencesForAction-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getLastOccurrenceDaysAgo = async (
  actionClassId: string,
  personId: string
): Promise<number | null> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const lastEvent = await prisma.action.findFirst({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            createdAt: true,
          },
        });

        if (!lastEvent) return null;
        return differenceInDays(new Date(), lastEvent.createdAt);
      } catch (error) {
        throw error;
      }
    },
    [`getLastOccurrenceDaysAgo-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();

export const getFirstOccurrenceDaysAgo = async (
  actionClassId: string,
  personId: string
): Promise<number | null> =>
  await unstable_cache(
    async () => {
      validateInputs([actionClassId, ZId], [personId, ZId]);

      try {
        const firstEvent = await prisma.action.findFirst({
          where: {
            personId,
            actionClass: {
              id: actionClassId,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            createdAt: true,
          },
        });

        if (!firstEvent) return null;
        return differenceInDays(new Date(), firstEvent.createdAt);
      } catch (error) {
        throw error;
      }
    },
    [`getFirstOccurrenceDaysAgo-${actionClassId}-${personId}`],
    {
      tags: [actionClassCache.tag.byId(actionClassId)],
      revalidate: SERVICES_REVALIDATION_INTERVAL,
    }
  )();
